import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, Plus, Trash2, Pencil, FileText, X, Check, CalendarDays } from "lucide-react";
import jsPDF from "jspdf";
import TruckLogo from "@/components/TruckLogo";
import { toast } from "@/hooks/use-toast";
import { getHolidayName } from "@/lib/holidays";

interface WorkDay {
  id: string;
  date: string;
  start: string;       // HH:MM
  end: string;         // HH:MM
  pauseStart: string;  // HH:MM (vide = pas de pause)
  pauseEnd: string;    // HH:MM
  cause: string;
  /** legacy */
  pauseMinutes?: number;
}

interface WorkerInfo {
  nom: string;
  prenom: string;
  agent: string;
}

const DAYS_KEY = "sabrinos_pointage_days";
const INFO_KEY = "sabrinos_pointage_info";

const NIGHT_START = 21 * 60;     // 21:00
const NIGHT_END = 6 * 60;        // 06:00

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

/** Minutes de nuit dans un intervalle [s,e] en minutes absolus (s<e), 21h→6h jour suivant. */
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
  total: number;     // heures
  night: number;     // heures
  day: number;       // heures
  pauseMin: number;
  pauseNightMin: number;
  pauseDayMin: number;
}

function dayBreakdown(d: WorkDay): Breakdown {
  if (!d.start || !d.end) return { total: 0, night: 0, day: 0, pauseMin: 0, pauseNightMin: 0, pauseDayMin: 0 };
  const startM = toMinutes(d.start);
  let endM = toMinutes(d.end);
  if (endM <= startM) endM += 24 * 60;

  // Pause: prend ps/pe explicites OU rétrocompatibilité pauseMinutes (réparties la journée)
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
    total: totalMin / 60,
    night: nightMin / 60,
    day: dayMin / 60,
    pauseMin: pauseTotal,
    pauseNightMin: pauseNight,
    pauseDayMin: pauseTotal - pauseNight,
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

/** Horaires par défaut selon le jour de la semaine */
function defaultScheduleFor(dateStr: string): { start: string; end: string; pauseStart: string; pauseEnd: string } {
  const dow = dowOf(dateStr);
  // Lun(1), Mer(3), Ven(5) : 00:30 → 09:00
  if (dow === 1 || dow === 3 || dow === 5) {
    return { start: "00:30", end: "09:00", pauseStart: "06:30", pauseEnd: "07:30" };
  }
  // Mar(2), Jeu(4) : 01:30 → 09:30
  if (dow === 2 || dow === 4) {
    return { start: "01:30", end: "09:30", pauseStart: "06:30", pauseEnd: "07:30" };
  }
  // WE : à saisir
  return { start: "", end: "", pauseStart: "", pauseEnd: "" };
}

const TimeTrackingPage = () => {
  const navigate = useNavigate();
  const [info, setInfo] = useState<WorkerInfo>(() => readJson(INFO_KEY, { nom: "", prenom: "", agent: "" }));
  const [days, setDays] = useState<WorkDay[]>(() => readJson(DAYS_KEY, []));
  const [period, setPeriod] = useState<"10" | "month" | "all">("month");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [pdfRange, setPdfRange] = useState<{ from: string; to: string }>({
    from: (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0,10); })(),
    to: today(),
  });
  const [showPdfDialog, setShowPdfDialog] = useState(false);

  const blankForm = (date = today()): WorkDay => {
    const s = defaultScheduleFor(date);
    return { id: "", date, ...s, cause: "" };
  };
  const [form, setForm] = useState<WorkDay>(blankForm());

  // Recharge auto les horaires par défaut quand on change la date (en mode création)
  useEffect(() => {
    if (editId) return;
    const s = defaultScheduleFor(form.date);
    setForm(f => ({ ...f, start: f.start || s.start, end: f.end || s.end, pauseStart: f.pauseStart || s.pauseStart, pauseEnd: f.pauseEnd || s.pauseEnd }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.date]);

  const saveInfo = (next: WorkerInfo) => {
    setInfo(next);
    localStorage.setItem(INFO_KEY, JSON.stringify(next));
  };

  const saveDays = (next: WorkDay[]) => {
    const sorted = [...next].sort((a, b) => b.date.localeCompare(a.date));
    setDays(sorted);
    localStorage.setItem(DAYS_KEY, JSON.stringify(sorted));
  };

  const applyDefaults = () => {
    const s = defaultScheduleFor(form.date);
    if (!s.start) { toast({ title: "Pas d'horaire par défaut le week-end" }); return; }
    setForm(f => ({ ...f, ...s }));
    toast({ title: "Horaires par défaut appliqués" });
  };

  const submitForm = () => {
    if (!form.date || !form.start || !form.end) {
      toast({ title: "Date et horaires obligatoires", variant: "destructive" });
      return;
    }
    const payload: WorkDay = { ...form };
    delete payload.pauseMinutes;
    if (editId) {
      saveDays(days.map(d => d.id === editId ? { ...payload, id: editId } : d));
      setEditId(null);
      setForm(blankForm());
      toast({ title: "Pointage modifié" });
    } else {
      const entry = { ...payload, id: crypto.randomUUID() };
      saveDays([entry, ...days]);
      setForm(blankForm());
      const b = dayBreakdown(entry);
      toast({ title: "Pointage ajouté", description: `${formatHours(b.total)} (nuit ${formatHours(b.night)})` });
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

    // En-tête tableau
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
      if (y > H - margin - 60) {
        doc.addPage(); y = margin; drawHeader();
      }
      const b = dayBreakdown(d);
      const holiday = getHolidayName(d.date);
      const pauseStr = d.pauseStart && d.pauseEnd
        ? `${d.pauseStart}-${d.pauseEnd} (${Math.round(b.pauseMin)}m)`
        : (d.pauseMinutes ? `${d.pauseMinutes}m` : "—");
      const note = [holiday ? `Férié: ${holiday}` : "", d.cause || ""].filter(Boolean).join(" • ");
      const row = [
        new Date(d.date).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" }),
        d.start, d.end, pauseStr,
        formatHours(b.total), formatHours(b.night), formatHours(b.day),
        note,
      ];
      // Ligne (zébré si férié)
      if (holiday) {
        doc.setFillColor(255, 240, 200);
        doc.rect(margin, y, W - margin * 2, 20, "F");
      }
      let x = margin + 4;
      for (let i = 0; i < cols.length; i++) {
        const text = String(row[i] ?? "");
        const w = cols[i].w - 6;
        doc.text(doc.splitTextToSize(text, w) as string[], x, y + 14);
        x += cols[i].w;
      }
      // Ligne séparatrice
      doc.setDrawColor(200);
      doc.line(margin, y + 20, W - margin, y + 20);
      y += 20;
    }

    y += 16;
    if (y > H - margin - 60) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`Total : ${formatHours(tot.total)}`, margin, y);
    y += 18;
    doc.text(`Heures de nuit : ${formatHours(tot.night)}`, margin, y);
    y += 18;
    doc.text(`Heures de jour : ${formatHours(tot.day)}`, margin, y);

    const fileName = `pointage_${info.nom || "agent"}_${pdfRange.from}_${pdfRange.to}.pdf`.replace(/\s+/g, "_");
    doc.save(fileName);
    setShowPdfDialog(false);
    toast({ title: "PDF téléchargé", description: fileName });
  };

  return (
    <div className="min-h-screen bg-black flex flex-col text-white">
      <TruckLogo />
      <div className="flex items-center gap-3 px-4 py-2">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-gray-800">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-black">POINTAGE</h1>
      </div>

      <div className="flex-1 px-4 pb-4 space-y-3 overflow-y-auto">
        {/* Identité */}
        <section className="bg-gray-900 border border-gray-700 rounded-xl p-3 grid grid-cols-1 gap-2">
          <input value={info.nom} onChange={(e) => saveInfo({ ...info, nom: e.target.value })} placeholder="Nom" className="rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white text-base" />
          <input value={info.prenom} onChange={(e) => saveInfo({ ...info, prenom: e.target.value })} placeholder="Prénom" className="rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white text-base" />
          <input value={info.agent} onChange={(e) => saveInfo({ ...info, agent: e.target.value })} placeholder="Numéro d'agent" className="rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white text-base" />
        </section>

        {/* Saisie */}
        <section className="bg-gray-900 border border-gray-700 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-bold text-base">{editId ? "✏️ Modifier la journée" : "➕ Nouvelle journée"}</p>
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

          <button onClick={applyDefaults} className="w-full rounded-lg bg-gray-700 p-2 flex items-center justify-center gap-2 text-sm font-bold">
            <CalendarDays size={16}/> Appliquer horaires par défaut
          </button>

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

          <input value={form.cause} onChange={(e) => setForm({ ...form, cause: e.target.value })} placeholder="Cause / remarque" className="w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white text-base" />

          {/* Aperçu calcul */}
          {form.start && form.end && (() => {
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
            {editId ? <><Check size={22}/> Enregistrer</> : <><Plus size={22}/> Ajouter</>}
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
                    <tr key={day.id} className="border-b border-gray-800">
                      <td className="py-2 pr-1">
                        {new Date(day.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                        {h && <div className="text-[10px] text-yellow-400 font-bold">🎉 {h}</div>}
                      </td>
                      <td className="py-2 pr-1 font-bold">{formatHours(b.total)}</td>
                      <td className="py-2 pr-1 text-purple-300">{formatHours(b.night)}</td>
                      <td className="py-2 flex items-center gap-1">
                        <button onClick={() => setDetailId(day.id)} className="text-blue-400 p-1"><Eye size={14} /></button>
                        <button onClick={() => startEdit(day)} className="text-yellow-400 p-1"><Pencil size={14} /></button>
                        <button onClick={() => { if (confirm("Supprimer ce pointage ?")) saveDays(days.filter((d) => d.id !== day.id)); }} className="text-red-400 p-1">
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
            <table className="w-full text-base">
              <tbody>
                <tr className="border-b border-gray-700"><td className="py-2 text-gray-400">Début</td><td className="py-2 font-bold text-right">{detailDay.start}</td></tr>
                <tr className="border-b border-gray-700"><td className="py-2 text-gray-400">Fin</td><td className="py-2 font-bold text-right">{detailDay.end}</td></tr>
                <tr className="border-b border-gray-700"><td className="py-2 text-gray-400">Pause</td><td className="py-2 font-bold text-right">{detailDay.pauseStart && detailDay.pauseEnd ? `${detailDay.pauseStart} → ${detailDay.pauseEnd}` : `${detailDay.pauseMinutes ?? 0} min`}</td></tr>
                <tr className="border-b border-gray-700"><td className="py-2 text-gray-400">Total</td><td className="py-2 font-black text-right text-green-400 text-xl">{formatHours(detailBreakdown.total)}</td></tr>
                <tr className="border-b border-gray-700"><td className="py-2 text-gray-400">Nuit</td><td className="py-2 font-black text-right text-purple-300 text-xl">{formatHours(detailBreakdown.night)}</td></tr>
                <tr className="border-b border-gray-700"><td className="py-2 text-gray-400">Jour</td><td className="py-2 font-bold text-right text-yellow-300">{formatHours(detailBreakdown.day)}</td></tr>
                {detailDay.cause && <tr><td className="py-2 text-gray-400">Cause</td><td className="py-2 text-right">{detailDay.cause}</td></tr>}
              </tbody>
            </table>
            <button onClick={() => setDetailId(null)} className="mt-4 w-full bg-blue-700 rounded-xl p-3 font-bold">Fermer</button>
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
                      <tr key={d.id} className="border-b border-gray-800">
                        <td className="py-1 pr-1">
                          {new Date(d.date).toLocaleDateString("fr-FR")}
                          {h && <div className="text-[9px] text-yellow-400">🎉</div>}
                        </td>
                        <td>{d.start}</td><td>{d.end}</td>
                        <td>{d.pauseStart || `${d.pauseMinutes ?? 0}m`}</td>
                        <td className="font-bold">{formatHours(b.total)}</td>
                        <td className="text-purple-300">{formatHours(b.night)}</td>
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
