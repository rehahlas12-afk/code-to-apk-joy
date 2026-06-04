import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, Plus, Trash2, Pencil, FileText, X, Check, CalendarDays, UserCog, LogIn, Heart, Stethoscope, Download } from "lucide-react";
import jsPDF from "jspdf";
import TruckLogo from "@/components/TruckLogo";
import { toast } from "@/hooks/use-toast";
import { getHolidayName } from "@/lib/holidays";

type AbsenceType = "repos" | "conge" | "maladie";

interface WorkDay {
  id: string;
  date: string;
  start: string;       // HH:MM
  end: string;         // HH:MM
  pauseStart: string;  // HH:MM
  pauseEnd: string;    // HH:MM
  cause: string;
  rest?: boolean;            // jour non travaillé (repos / congé / maladie)
  absenceType?: AbsenceType; // précise le type si non travaillé
  /** legacy */
  pauseMinutes?: number;
}

const ABSENCE_LABEL: Record<AbsenceType, string> = {
  repos: "REPOS",
  conge: "CONGÉ PAYÉ",
  maladie: "MALADIE",
};
const ABSENCE_EMOJI: Record<AbsenceType, string> = { repos: "🛌", conge: "🌴", maladie: "🤒" };

function absenceOf(d: WorkDay): AbsenceType | null {
  if (d.absenceType) return d.absenceType;
  if (d.rest) return "repos";
  return null;
}

interface WorkerInfo {
  nom: string;
  prenom: string;
  agent: string;
}

const INFO_KEY = "sabrinos_pointage_info";
const daysKeyFor = (agent: string) => `sabrinos_pointage_days_${(agent || "_").trim().toLowerCase()}`;

const NIGHT_START = 21 * 60;
const NIGHT_END = 6 * 60;

const today = () => new Date().toISOString().slice(0, 10);

function readJson<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) as T : fallback;
  } catch { return fallback; }
}

function toMinutes(time: string): number {
  if (!time) return 0;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function nightInside(startM: number, endM: number): number {
  if (endM <= startM) return 0;
  const windows = [
    { s: -24 * 60, e: NIGHT_END },
    { s: NIGHT_START, e: 24 * 60 + NIGHT_END },
    { s: 24 * 60 + NIGHT_START, e: 48 * 60 + NIGHT_END },
    { s: 48 * 60 + NIGHT_START, e: 72 * 60 + NIGHT_END },
  ];
  let n = 0;
  for (const w of windows) {
    const s = Math.max(startM, w.s);
    const e = Math.min(endM, w.e);
    if (e > s) n += e - s;
  }
  return n;
}

interface Breakdown {
  total: number; night: number; day: number;
  pauseMin: number; pauseNightMin: number; pauseDayMin: number;
}

function dayBreakdown(d: WorkDay): Breakdown {
  if (absenceOf(d) || !d.start || !d.end) return { total: 0, night: 0, day: 0, pauseMin: 0, pauseNightMin: 0, pauseDayMin: 0 };
  const startM = toMinutes(d.start);
  let endM = toMinutes(d.end);
  if (endM <= startM) endM += 24 * 60;

  let pauseTotal = 0, pauseNight = 0;
  if (d.pauseStart && d.pauseEnd) {
    let ps = toMinutes(d.pauseStart);
    let pe = toMinutes(d.pauseEnd);
    if (ps < startM) ps += 24 * 60;
    if (pe <= ps) pe += 24 * 60;
    ps = Math.max(ps, startM);
    pe = Math.min(pe, endM);
    if (pe > ps) {
      pauseTotal = pe - ps;
      pauseNight = nightInside(ps, pe);
    }
  } else if (d.pauseMinutes && d.pauseMinutes > 0) {
    pauseTotal = d.pauseMinutes;
    const grossNight = nightInside(startM, endM);
    const gross = Math.max(1, endM - startM);
    pauseNight = (pauseTotal * grossNight) / gross;
  }

  const grossNightMin = nightInside(startM, endM);
  const grossMin = Math.max(0, endM - startM);
  const nightMin = Math.max(0, grossNightMin - pauseNight);
  const totalMin = Math.max(0, grossMin - pauseTotal);
  const dayMin = Math.max(0, totalMin - nightMin);

  return {
    total: totalMin / 60, night: nightMin / 60, day: dayMin / 60,
    pauseMin: pauseTotal, pauseNightMin: pauseNight, pauseDayMin: pauseTotal - pauseNight,
  };
}

function formatHours(value: number): string {
  if (!isFinite(value) || value <= 0) return "0h00";
  const totalMin = Math.round(value * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function dowOf(dateStr: string): number {
  return new Date(dateStr + "T12:00:00").getDay(); // 0=dim..6=sam
}

/** Horaires par défaut selon le jour (5/7, samedi = repos) */
function defaultScheduleFor(dateStr: string): { start: string; end: string; pauseStart: string; pauseEnd: string; rest: boolean } {
  const dow = dowOf(dateStr);
  if (dow === 6) return { start: "", end: "", pauseStart: "", pauseEnd: "", rest: true }; // samedi
  if (dow === 0) return { start: "", end: "", pauseStart: "", pauseEnd: "", rest: false }; // dimanche libre
  if (dow === 1 || dow === 3 || dow === 5) {
    return { start: "00:30", end: "09:00", pauseStart: "06:30", pauseEnd: "07:30", rest: false };
  }
  return { start: "01:30", end: "09:30", pauseStart: "06:30", pauseEnd: "07:30", rest: false };
}

const TimeTrackingPage = () => {
  const navigate = useNavigate();
  const [info, setInfo] = useState<WorkerInfo>(() => readJson(INFO_KEY, { nom: "", prenom: "", agent: "" }));
  const [identified, setIdentified] = useState<boolean>(() => {
    const i = readJson<WorkerInfo>(INFO_KEY, { nom: "", prenom: "", agent: "" });
    return !!(i.nom && i.prenom && i.agent);
  });
  // formulaire d'identification (séparé pour éviter d'écrire les champs partiels)
  const [loginForm, setLoginForm] = useState<WorkerInfo>(() => readJson(INFO_KEY, { nom: "", prenom: "", agent: "" }));

  const [days, setDays] = useState<WorkDay[]>(() => readJson(daysKeyFor(info.agent), []));
  const [period, setPeriod] = useState<"10" | "month" | "all">("month");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // Mois de paie : du 25 du mois précédent au 24 du mois courant
  const payrollRange = (() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    const fromDate = d >= 25 ? new Date(y, m, 25) : new Date(y, m - 1, 25);
    const toDate = d >= 25 ? new Date(y, m + 1, 24) : new Date(y, m, 24);
    return { from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10) };
  })();
  const [pdfRange, setPdfRange] = useState<{ from: string; to: string }>(payrollRange);
  const [showPdfDialog, setShowPdfDialog] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [showAbsenceDialog, setShowAbsenceDialog] = useState(false);
  const [absenceForm, setAbsenceForm] = useState<{ type: AbsenceType; from: string; to: string; cause: string }>({
    type: "conge", from: today(), to: today(), cause: "",
  });

  const blankForm = (date = today()): WorkDay => {
    const s = defaultScheduleFor(date);
    return { id: "", date, start: s.start, end: s.end, pauseStart: s.pauseStart, pauseEnd: s.pauseEnd, cause: s.rest ? "Repos" : "", rest: s.rest };
  };
  const [form, setForm] = useState<WorkDay>(blankForm());

  // Recharge horaires par défaut quand on change la date (mode création)
  useEffect(() => {
    if (editId) return;
    const s = defaultScheduleFor(form.date);
    setForm(f => ({
      ...f,
      start: s.start, end: s.end,
      pauseStart: s.pauseStart, pauseEnd: s.pauseEnd,
      rest: s.rest,
      cause: s.rest ? (f.cause || "Repos") : f.cause,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.date]);

  const saveInfo = (next: WorkerInfo) => {
    setInfo(next);
    localStorage.setItem(INFO_KEY, JSON.stringify(next));
  };

  const persistDays = (next: WorkDay[], agent = info.agent) => {
    const sorted = [...next].sort((a, b) => b.date.localeCompare(a.date));
    setDays(sorted);
    localStorage.setItem(daysKeyFor(agent), JSON.stringify(sorted));
    return sorted;
  };

  // Recharge les jours quand on change d'agent
  useEffect(() => {
    if (!identified) return;
    setDays(readJson(daysKeyFor(info.agent), []));
  }, [info.agent, identified]);

  // Auto-création du jour courant si absent (samedi = repos)
  const autoSeededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!identified) return;
    const key = `${info.agent}|${today()}`;
    if (autoSeededRef.current === key) return;
    const existing = readJson<WorkDay[]>(daysKeyFor(info.agent), []);
    if (!existing.find(d => d.date === today())) {
      const t = today();
      const s = defaultScheduleFor(t);
      const entry: WorkDay = {
        id: crypto.randomUUID(), date: t,
        start: s.start, end: s.end, pauseStart: s.pauseStart, pauseEnd: s.pauseEnd,
        cause: s.rest ? "Repos" : "", rest: s.rest,
      };
      persistDays([entry, ...existing], info.agent);
    }
    autoSeededRef.current = key;
  }, [identified, info.agent]);

  // Sauvegarde automatique du formulaire (upsert par date)
  const autoSaveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!identified) return;
    if (!form.date) return;
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      // En édition : on ne touche pas tant que l'utilisateur n'a pas validé (évite double entrée)
      if (editId) return;
      // Si journée vide (ni horaires ni repos), on n'enregistre pas
      if (!form.rest && !form.start && !form.end) return;
      const existing = days.find(d => d.date === form.date);
      const payload: WorkDay = { ...form, id: existing?.id || crypto.randomUUID() };
      delete payload.pauseMinutes;
      if (existing) {
        persistDays(days.map(d => d.id === existing.id ? payload : d));
      } else {
        persistDays([payload, ...days]);
      }
    }, 600);
    return () => { if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, identified]);

  const applyDefaults = () => {
    const s = defaultScheduleFor(form.date);
    setForm(f => ({ ...f, ...s, cause: s.rest ? "Repos" : f.cause }));
    toast({ title: s.rest ? "Jour de repos" : "Horaires par défaut appliqués" });
  };

  const toggleRest = () => {
    setForm(f => f.rest
      ? { ...f, rest: false, absenceType: undefined, cause: f.cause === "Repos" ? "" : f.cause }
      : { ...f, rest: true, absenceType: "repos", start: "", end: "", pauseStart: "", pauseEnd: "", cause: "Repos" }
    );
  };

  const applyAbsenceRange = () => {
    const { type, from, to, cause } = absenceForm;
    if (!from || !to || from > to) {
      toast({ title: "Plage de dates invalide", variant: "destructive" });
      return;
    }
    const start = new Date(from + "T12:00:00");
    const end = new Date(to + "T12:00:00");
    const entries: WorkDay[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      entries.push({
        id: crypto.randomUUID(), date: ds,
        start: "", end: "", pauseStart: "", pauseEnd: "",
        cause: cause || ABSENCE_LABEL[type],
        rest: true, absenceType: type,
      });
    }
    const byDate = new Map(days.map(d => [d.date, d]));
    for (const e of entries) {
      const ex = byDate.get(e.date);
      byDate.set(e.date, { ...e, id: ex?.id || e.id });
    }
    persistDays(Array.from(byDate.values()));
    setShowAbsenceDialog(false);
    toast({ title: `${ABSENCE_LABEL[type]} enregistrée`, description: `${entries.length} jour(s)` });
  };

  const submitForm = () => {
    if (!form.rest && (!form.date || !form.start || !form.end)) {
      toast({ title: "Date et horaires obligatoires", variant: "destructive" });
      return;
    }
    const payload: WorkDay = { ...form };
    delete payload.pauseMinutes;
    if (editId) {
      persistDays(days.map(d => d.id === editId ? { ...payload, id: editId } : d));
      setEditId(null);
      setForm(blankForm());
      toast({ title: "Pointage modifié" });
    } else {
      const existing = days.find(d => d.date === form.date);
      const entry = { ...payload, id: existing?.id || crypto.randomUUID() };
      if (existing) {
        persistDays(days.map(d => d.id === existing.id ? entry : d));
      } else {
        persistDays([entry, ...days]);
      }
      setForm(blankForm());
      const b = dayBreakdown(entry);
      toast({ title: "Enregistré", description: entry.rest ? "Repos" : `${formatHours(b.total)} (nuit ${formatHours(b.night)})` });
    }
  };

  const startEdit = (d: WorkDay) => {
    setEditId(d.id);
    setForm({ ...d });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditId(null);
    setForm(blankForm());
  };

  const filteredDays = useMemo(() => {
    const now = new Date();
    if (period === "all") return days;
    if (period === "10") {
      const min = new Date(now); min.setDate(now.getDate() - 9);
      const minKey = min.toISOString().slice(0, 10);
      return days.filter((day) => day.date >= minKey);
    }
    const monthKey = now.toISOString().slice(0, 7);
    return days.filter((day) => day.date.startsWith(monthKey));
  }, [days, period]);

  const totals = filteredDays.reduce((acc, day) => {
    const b = dayBreakdown(day);
    acc.total += b.total; acc.night += b.night; acc.day += b.day;
    return acc;
  }, { total: 0, night: 0, day: 0 });

  const detailDay = detailId ? days.find(d => d.id === detailId) : null;
  const detailBreakdown = detailDay ? dayBreakdown(detailDay) : null;
  const detailHoliday = detailDay ? getHolidayName(detailDay.date) : null;
  const formHoliday = getHolidayName(form.date);

  const allHistorySorted = useMemo(() => [...days].sort((a, b) => a.date.localeCompare(b.date)), [days]);
  const historyTotals = allHistorySorted.reduce((acc, d) => {
    const b = dayBreakdown(d);
    acc.total += b.total; acc.night += b.night; acc.day += b.day; return acc;
  }, { total: 0, night: 0, day: 0 });

  const generatePdf = () => {
    const inRange = days.filter(d => d.date >= pdfRange.from && d.date <= pdfRange.to)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (inRange.length === 0) {
      toast({ title: "Aucun pointage sur cette période", variant: "destructive" });
      return;
    }
    const tot = inRange.reduce((acc, d) => {
      const b = dayBreakdown(d);
      acc.total += b.total; acc.night += b.night; acc.day += b.day; return acc;
    }, { total: 0, night: 0, day: 0 });

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const margin = 36;
    let y = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("Pointage – STAF Transport", margin, y);
    y += 26;

    doc.setFontSize(14);
    doc.text(`${info.nom || ""} ${info.prenom || ""}`.trim() || "—", margin, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(`N° agent : ${info.agent || "—"}`, margin, y);
    y += 16;
    doc.text(`Période : ${new Date(pdfRange.from).toLocaleDateString("fr-FR")}  au  ${new Date(pdfRange.to).toLocaleDateString("fr-FR")}`, margin, y);
    y += 22;

    const cols = [
      { k: "date",  w: 80,  label: "Date" },
      { k: "start", w: 52,  label: "Début" },
      { k: "end",   w: 52,  label: "Fin" },
      { k: "pause", w: 90,  label: "Pause" },
      { k: "tot",   w: 60,  label: "Total" },
      { k: "nuit",  w: 60,  label: "Nuit" },
      { k: "jour",  w: 60,  label: "Jour" },
      { k: "note",  w: W - margin * 2 - (80+52+52+90+60+60+60), label: "Remarque" },
    ];
    const drawHeader = () => {
      doc.setFillColor(30, 30, 30);
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.rect(margin, y, W - margin * 2, 22, "F");
      let x = margin + 4;
      for (const c of cols) { doc.text(c.label, x, y + 15); x += c.w; }
      y += 22;
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
    };
    drawHeader();

    doc.setFontSize(11);
    for (const d of inRange) {
      if (y > H - margin - 60) { doc.addPage(); y = margin; drawHeader(); }
      const b = dayBreakdown(d);
      const holiday = getHolidayName(d.date);
      const pauseStr = d.rest ? "—" : (d.pauseStart && d.pauseEnd
        ? `${d.pauseStart}-${d.pauseEnd} (${Math.round(b.pauseMin)}m)`
        : (d.pauseMinutes ? `${d.pauseMinutes}m` : "—"));
      const note = [holiday ? `Férié: ${holiday}` : "", d.rest ? "REPOS" : "", d.cause || ""].filter(Boolean).join(" • ");
      const row = [
        new Date(d.date).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" }),
        d.rest ? "—" : d.start, d.rest ? "—" : d.end, pauseStr,
        formatHours(b.total), formatHours(b.night), formatHours(b.day),
        note,
      ];
      if (holiday) {
        doc.setFillColor(255, 240, 200);
        doc.rect(margin, y, W - margin * 2, 20, "F");
      } else if (d.rest) {
        doc.setFillColor(225, 235, 255);
        doc.rect(margin, y, W - margin * 2, 20, "F");
      }
      let x = margin + 4;
      for (let i = 0; i < cols.length; i++) {
        const text = String(row[i] ?? "");
        const w = cols[i].w - 6;
        doc.text(doc.splitTextToSize(text, w) as string[], x, y + 14);
        x += cols[i].w;
      }
      doc.setDrawColor(200);
      doc.line(margin, y + 20, W - margin, y + 20);
      y += 20;
    }

    y += 16;
    if (y > H - margin - 60) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`Total : ${formatHours(tot.total)}`, margin, y); y += 18;
    doc.text(`Heures de nuit : ${formatHours(tot.night)}`, margin, y); y += 18;
    doc.text(`Heures de jour : ${formatHours(tot.day)}`, margin, y);

    const fileName = `pointage_${info.nom || "agent"}_${pdfRange.from}_${pdfRange.to}.pdf`.replace(/\s+/g, "_");
    doc.save(fileName);
    setShowPdfDialog(false);
    toast({ title: "PDF téléchargé", description: fileName });
  };

  const handleLogin = () => {
    const v: WorkerInfo = {
      nom: loginForm.nom.trim(),
      prenom: loginForm.prenom.trim(),
      agent: loginForm.agent.trim(),
    };
    if (!v.nom || !v.prenom || !v.agent) {
      toast({ title: "Nom, prénom et n° agent requis", variant: "destructive" });
      return;
    }
    saveInfo(v);
    setIdentified(true);
  };

  const handleSwitchAgent = () => {
    setIdentified(false);
    setLoginForm(info);
    setEditId(null);
    setForm(blankForm());
  };

  // ====================== ÉCRAN D'IDENTIFICATION ======================
  if (!identified) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        <TruckLogo />
        <div className="flex items-center gap-3 px-4 py-2">
          <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-gray-800">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-black">POINTAGE</h1>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl p-5 space-y-4">
            <h2 className="text-2xl font-black text-center text-green-400">Identification</h2>
            <p className="text-sm text-gray-400 text-center">Chaque agent retrouve son propre pointage.</p>

            <label className="block">
              <span className="text-sm text-gray-300">Nom</span>
              <input value={loginForm.nom} onChange={(e) => setLoginForm({ ...loginForm, nom: e.target.value })}
                placeholder="Nom" autoFocus
                className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white text-lg" />
            </label>
            <label className="block">
              <span className="text-sm text-gray-300">Prénom</span>
              <input value={loginForm.prenom} onChange={(e) => setLoginForm({ ...loginForm, prenom: e.target.value })}
                placeholder="Prénom"
                className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white text-lg" />
            </label>
            <label className="block">
              <span className="text-sm text-gray-300">Numéro d'agent</span>
              <input value={loginForm.agent} onChange={(e) => setLoginForm({ ...loginForm, agent: e.target.value })}
                placeholder="N° agent" inputMode="text"
                className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white text-lg" />
            </label>

            <button onClick={handleLogin}
              className="w-full rounded-xl bg-green-700 hover:bg-green-600 p-4 flex items-center justify-center gap-2 font-bold text-lg">
              <LogIn size={22}/> Valider
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ====================== ÉCRAN POINTAGE ======================
  return (
    <div className="min-h-screen bg-black flex flex-col text-white">
      <TruckLogo />
      <div className="flex items-center gap-3 px-4 py-2">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-gray-800">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-black flex-1">POINTAGE</h1>
        <button onClick={handleSwitchAgent} className="p-2 rounded-lg bg-gray-800 flex items-center gap-1 text-xs font-bold">
          <UserCog size={16}/> Changer
        </button>
      </div>

      <div className="flex-1 px-4 pb-4 space-y-3 overflow-y-auto">
        {/* Bandeau identité */}
        <section className="bg-gray-900 border border-green-600 rounded-xl p-3 flex items-center justify-between">
          <div>
            <p className="text-lg font-black">{info.nom} {info.prenom}</p>
            <p className="text-xs text-gray-400">Agent n° <span className="text-green-400 font-bold">{info.agent}</span> • 5/7 (samedi repos)</p>
          </div>
          <div className="text-[10px] text-green-400 font-bold">● Sauvegarde auto</div>
        </section>

        {/* Saisie */}
        <section className="bg-gray-900 border border-gray-700 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-bold text-base">{editId ? "✏️ Modifier la journée" : "➕ Journée"}</p>
            {editId && (
              <button onClick={cancelEdit} className="text-xs bg-gray-700 px-2 py-1 rounded">Annuler</button>
            )}
          </div>

          {formHoliday && (
            <div className="bg-yellow-900/40 border border-yellow-500 rounded-lg px-3 py-2 text-yellow-200 text-sm font-bold">
              🎉 Jour férié : {formHoliday}
            </div>
          )}

          <label className="block text-sm text-gray-300">Date
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-3 text-white text-base" />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={applyDefaults} className="rounded-lg bg-gray-700 p-2 flex items-center justify-center gap-2 text-sm font-bold">
              <CalendarDays size={16}/> Horaires défaut
            </button>
            <button onClick={toggleRest} className={`rounded-lg p-2 flex items-center justify-center gap-2 text-sm font-bold ${form.rest ? "bg-blue-700" : "bg-gray-700"}`}>
              {form.rest ? "🛌 REPOS (toucher pour travailler)" : "Marquer REPOS"}
            </button>
          </div>

          {!form.rest && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm text-gray-300">Début travail
                <input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-3 text-white text-base" />
              </label>
              <label className="text-sm text-gray-300">Fin travail
                <input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-3 text-white text-base" />
              </label>
              <label className="text-sm text-gray-300">Pause début
                <input type="time" value={form.pauseStart} onChange={(e) => setForm({ ...form, pauseStart: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-3 text-white text-base" />
              </label>
              <label className="text-sm text-gray-300">Pause fin
                <input type="time" value={form.pauseEnd} onChange={(e) => setForm({ ...form, pauseEnd: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-3 text-white text-base" />
              </label>
            </div>
          )}

          <input value={form.cause} onChange={(e) => setForm({ ...form, cause: e.target.value })} placeholder="Cause / remarque" className="w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white text-base" />

          {!form.rest && form.start && form.end && (() => {
            const b = dayBreakdown(form);
            return (
              <div className="bg-gray-800 rounded-lg p-2 text-sm grid grid-cols-3 gap-2 text-center">
                <div><p className="text-gray-400">Total</p><p className="font-black text-green-400 text-lg">{formatHours(b.total)}</p></div>
                <div><p className="text-gray-400">Nuit</p><p className="font-black text-purple-300 text-lg">{formatHours(b.night)}</p></div>
                <div><p className="text-gray-400">Jour</p><p className="font-black text-yellow-300 text-lg">{formatHours(b.day)}</p></div>
              </div>
            );
          })()}

          <button onClick={submitForm} className="w-full rounded-xl bg-green-700 p-4 flex items-center justify-center gap-2 font-bold text-lg">
            {editId ? <><Check size={22}/> Enregistrer modification</> : <><Plus size={22}/> Confirmer (auto-sauvegardé)</>}
          </button>
        </section>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setShowHistory(true)} className="bg-blue-700 rounded-xl p-3 flex items-center justify-center gap-2 font-bold">
            <Eye size={18}/> Visualiser tout
          </button>
          <button onClick={() => setShowPdfDialog(true)} className="bg-purple-700 rounded-xl p-3 flex items-center justify-center gap-2 font-bold">
            <FileText size={18}/> Télécharger PDF
          </button>
        </div>

        {/* Liste pointages */}
        <section className="bg-gray-900 border border-gray-700 rounded-xl p-3">
          <select value={period} onChange={(e) => setPeriod(e.target.value as "10" | "month" | "all")} className="w-full mb-3 rounded-lg bg-gray-800 border border-gray-600 px-3 py-2 text-white">
            <option value="10">10 derniers jours</option>
            <option value="month">Ce mois</option>
            <option value="all">Tout</option>
          </select>

          <div className="text-center mb-3">
            <p className="text-base font-bold">Total période</p>
            <p className="text-3xl font-black text-green-400">{formatHours(totals.total)}</p>
            <p className="text-sm font-bold text-purple-300">nuit : {formatHours(totals.night)} • jour : {formatHours(totals.day)}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-700 text-left">
                  <th className="py-2 pr-1">Date</th>
                  <th className="py-2 pr-1">H.</th>
                  <th className="py-2 pr-1">Nuit</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredDays.map((day) => {
                  const b = dayBreakdown(day);
                  const h = getHolidayName(day.date);
                  return (
                    <tr key={day.id} className={`border-b border-gray-800 ${day.rest ? "bg-blue-950/40" : ""}`}>
                      <td className="py-2 pr-1">
                        {new Date(day.date).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                        {h && <div className="text-[10px] text-yellow-400 font-bold">🎉 {h}</div>}
                        {day.rest && <div className="text-[10px] text-blue-300 font-bold">🛌 REPOS</div>}
                      </td>
                      <td className="py-2 pr-1 font-bold">{day.rest ? "—" : formatHours(b.total)}</td>
                      <td className="py-2 pr-1 text-purple-300">{day.rest ? "—" : formatHours(b.night)}</td>
                      <td className="py-2 flex items-center gap-1">
                        <button onClick={() => setDetailId(day.id)} className="text-blue-400 p-1"><Eye size={14} /></button>
                        <button onClick={() => startEdit(day)} className="text-yellow-400 p-1"><Pencil size={14} /></button>
                        <button onClick={() => { if (confirm("Supprimer ce pointage ?")) persistDays(days.filter((d) => d.id !== day.id)); }} className="text-red-400 p-1">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredDays.length === 0 && <p className="text-center text-gray-500 py-6">Aucun pointage pour cette période.</p>}
        </section>
      </div>

      {/* Modal Détail */}
      {detailDay && detailBreakdown && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={() => setDetailId(null)}>
          <div className="bg-gray-900 border-2 border-blue-500 rounded-2xl p-4 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-black text-center mb-2">Détail journée</h2>
            <p className="text-center text-xl font-bold text-blue-400 mb-2">{new Date(detailDay.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p>
            {detailHoliday && <p className="text-center text-yellow-400 font-bold mb-2">🎉 Jour férié : {detailHoliday}</p>}
            {detailDay.rest && <p className="text-center text-blue-300 font-bold mb-2">🛌 REPOS</p>}
            <table className="w-full text-base">
              <tbody>
                <tr className="border-b border-gray-700"><td className="py-2 text-gray-400">Début</td><td className="py-2 font-bold text-right">{detailDay.rest ? "—" : detailDay.start}</td></tr>
                <tr className="border-b border-gray-700"><td className="py-2 text-gray-400">Fin</td><td className="py-2 font-bold text-right">{detailDay.rest ? "—" : detailDay.end}</td></tr>
                <tr className="border-b border-gray-700"><td className="py-2 text-gray-400">Pause</td><td className="py-2 font-bold text-right">{detailDay.rest ? "—" : (detailDay.pauseStart && detailDay.pauseEnd ? `${detailDay.pauseStart} → ${detailDay.pauseEnd}` : `${detailDay.pauseMinutes ?? 0} min`)}</td></tr>
                <tr className="border-b border-gray-700"><td className="py-2 text-gray-400">Total</td><td className="py-2 font-black text-right text-green-400 text-xl">{formatHours(detailBreakdown.total)}</td></tr>
                <tr className="border-b border-gray-700"><td className="py-2 text-gray-400">Nuit</td><td className="py-2 font-black text-right text-purple-300 text-xl">{formatHours(detailBreakdown.night)}</td></tr>
                <tr className="border-b border-gray-700"><td className="py-2 text-gray-400">Jour</td><td className="py-2 font-bold text-right text-yellow-300">{formatHours(detailBreakdown.day)}</td></tr>
                {detailDay.cause && <tr><td className="py-2 text-gray-400">Cause</td><td className="py-2 text-right">{detailDay.cause}</td></tr>}
              </tbody>
            </table>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={() => { startEdit(detailDay); setDetailId(null); }} className="bg-yellow-600 rounded-xl p-3 font-bold flex items-center justify-center gap-2"><Pencil size={16}/> Modifier</button>
              <button onClick={() => setDetailId(null)} className="bg-blue-700 rounded-xl p-3 font-bold">Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Historique complet */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col" onClick={() => setShowHistory(false)}>
          <div className="bg-gray-900 m-2 rounded-2xl border-2 border-blue-500 flex-1 flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-gray-700">
              <h2 className="text-lg font-black">Historique complet</h2>
              <button onClick={() => setShowHistory(false)} className="p-2 bg-gray-800 rounded-lg"><X size={18}/></button>
            </div>
            <div className="text-center py-2 border-b border-gray-700">
              <p className="text-xs text-gray-400">{info.nom} {info.prenom} • Agent {info.agent || "—"}</p>
              <p className="text-2xl font-black text-green-400">{formatHours(historyTotals.total)}</p>
              <p className="text-xs text-purple-300">nuit {formatHours(historyTotals.night)} • jour {formatHours(historyTotals.day)}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-gray-700 text-left">
                  <th className="py-1 pr-1">Date</th><th>Déb.</th><th>Fin</th><th>Pause</th><th>H.</th><th>Nuit</th>
                </tr></thead>
                <tbody>
                  {allHistorySorted.map(d => {
                    const b = dayBreakdown(d);
                    const h = getHolidayName(d.date);
                    return (
                      <tr key={d.id} className={`border-b border-gray-800 ${d.rest ? "bg-blue-950/40" : ""}`}>
                        <td className="py-1 pr-1">
                          {new Date(d.date).toLocaleDateString("fr-FR")}
                          {h && <div className="text-[9px] text-yellow-400">🎉</div>}
                          {d.rest && <div className="text-[9px] text-blue-300">🛌</div>}
                        </td>
                        <td>{d.rest ? "—" : d.start}</td><td>{d.rest ? "—" : d.end}</td>
                        <td>{d.rest ? "—" : (d.pauseStart || `${d.pauseMinutes ?? 0}m`)}</td>
                        <td className="font-bold">{d.rest ? "—" : formatHours(b.total)}</td>
                        <td className="text-purple-300">{d.rest ? "—" : formatHours(b.night)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {allHistorySorted.length === 0 && <p className="text-center text-gray-500 py-6">Aucun pointage.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Modal PDF range */}
      {showPdfDialog && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={() => setShowPdfDialog(false)}>
          <div className="bg-gray-900 border-2 border-purple-500 rounded-2xl p-4 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-black mb-3 text-center">Télécharger PDF</h2>
            <p className="text-xs text-gray-400 mb-2">Le fichier sera enregistré sur votre téléphone.</p>
            <label className="block text-sm text-gray-300 mb-2">Du
              <input type="date" value={pdfRange.from} onChange={(e) => setPdfRange({ ...pdfRange, from: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-2 text-white" />
            </label>
            <label className="block text-sm text-gray-300 mb-3">Au
              <input type="date" value={pdfRange.to} onChange={(e) => setPdfRange({ ...pdfRange, to: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-2 text-white" />
            </label>
            <div className="flex gap-2">
              <button onClick={() => setShowPdfDialog(false)} className="flex-1 bg-gray-700 rounded-xl p-3 font-bold">Annuler</button>
              <button onClick={generatePdf} className="flex-1 bg-purple-700 rounded-xl p-3 font-bold">Générer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeTrackingPage;
