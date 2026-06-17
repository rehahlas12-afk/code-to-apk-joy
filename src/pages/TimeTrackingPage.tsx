import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, Plus, Trash2, Pencil, FileText, X, Check, CalendarDays, UserCog, LogIn, Heart, Download, Upload, Settings2, Zap, Hand, Save } from "lucide-react";
import jsPDF from "jspdf";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import TruckLogo from "@/components/TruckLogo";
import { toast } from "@/hooks/use-toast";
import { getHolidayName } from "@/lib/holidays";
import { saveBase64ToPhone, saveTextToPhone, sharePhoneFile } from "@/lib/nativeFile";

type AbsenceType = "repos" | "conge" | "maladie";
type SaveMode = "auto" | "manual";

interface WorkDay {
  id: string;
  date: string;
  start: string;
  end: string;
  pauseStart: string;
  pauseEnd: string;
  cause: string;
  rest?: boolean;
  absenceType?: AbsenceType;
  pauseMinutes?: number;
}

interface DayTemplate {
  start: string;
  end: string;
  pauseStart: string;
  pauseEnd: string;
  rest: boolean;
}

interface WorkerInfo {
  nom: string;
  prenom: string;
  agent: string;
}

const ABSENCE_LABEL: Record<AbsenceType, string> = { repos: "REPOS", conge: "CONGÉ PAYÉ", maladie: "MALADIE" };
const ABSENCE_EMOJI: Record<AbsenceType, string> = { repos: "🛌", conge: "🌴", maladie: "🤒" };

// Jours dans l'ordre demandé : Samedi → Vendredi
const WEEK_ORDER: number[] = [6, 0, 1, 2, 3, 4, 5];
const DAY_LABELS: Record<number, string> = {
  0: "Dimanche", 1: "Lundi", 2: "Mardi", 3: "Mercredi", 4: "Jeudi", 5: "Vendredi", 6: "Samedi",
};

const INFO_KEY = "sabrinos_pointage_info";
const daysKeyFor = (agent: string) => `sabrinos_pointage_days_${(agent || "_").trim().toLowerCase()}`;
const modeKeyFor = (agent: string) => `sabrinos_pointage_mode_${(agent || "_").trim().toLowerCase()}`;
const tplKeyFor  = (agent: string) => `sabrinos_pointage_tpl_${(agent || "_").trim().toLowerCase()}`;

const NIGHT_START = 21 * 60;
const NIGHT_END = 6 * 60;

const today = () => new Date().toISOString().slice(0, 10);

function readJson<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? (JSON.parse(data) as T) : fallback;
  } catch { return fallback; }
}

function toMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
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

interface Breakdown { total: number; night: number; day: number; pauseMin: number; pauseNightMin: number; pauseDayMin: number; }

function absenceOf(d: WorkDay): AbsenceType | null {
  if (d.absenceType) return d.absenceType;
  if (d.rest) return "repos";
  return null;
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
    ps = Math.max(ps, startM); pe = Math.min(pe, endM);
    if (pe > ps) { pauseTotal = pe - ps; pauseNight = nightInside(ps, pe); }
  } else if (d.pauseMinutes && d.pauseMinutes > 0) {
    pauseTotal = d.pauseMinutes;
    const gn = nightInside(startM, endM);
    const g = Math.max(1, endM - startM);
    pauseNight = (pauseTotal * gn) / g;
  }
  const grossNightMin = nightInside(startM, endM);
  const grossMin = Math.max(0, endM - startM);
  const nightMin = Math.max(0, grossNightMin - pauseNight);
  const totalMin = Math.max(0, grossMin - pauseTotal);
  const dayMin = Math.max(0, totalMin - nightMin);
  return { total: totalMin / 60, night: nightMin / 60, day: dayMin / 60, pauseMin: pauseTotal, pauseNightMin: pauseNight, pauseDayMin: pauseTotal - pauseNight };
}

function formatHours(v: number): string {
  if (!isFinite(v) || v <= 0) return "0h00";
  const tm = Math.round(v * 60);
  return `${Math.floor(tm / 60)}h${String(tm % 60).padStart(2, "0")}`;
}

const dowOf = (dateStr: string): number => new Date(dateStr + "T12:00:00").getDay();

const DEFAULT_TEMPLATE: DayTemplate[] = [
  { start: "", end: "", pauseStart: "", pauseEnd: "", rest: false },                                  // dim
  { start: "00:30", end: "09:00", pauseStart: "06:30", pauseEnd: "07:30", rest: false },              // lun
  { start: "01:30", end: "09:30", pauseStart: "06:30", pauseEnd: "07:30", rest: false },              // mar
  { start: "00:30", end: "09:00", pauseStart: "06:30", pauseEnd: "07:30", rest: false },              // mer
  { start: "01:30", end: "09:30", pauseStart: "06:30", pauseEnd: "07:30", rest: false },              // jeu
  { start: "00:30", end: "09:00", pauseStart: "06:30", pauseEnd: "07:30", rest: false },              // ven
  { start: "", end: "", pauseStart: "", pauseEnd: "", rest: true },                                   // sam
];
const BLANK_TEMPLATE: DayTemplate[] = Array.from({ length: 7 }, () => ({ start: "", end: "", pauseStart: "", pauseEnd: "", rest: false }));

function scheduleFor(dateStr: string, tpl: DayTemplate[]): DayTemplate {
  return tpl[dowOf(dateStr)] ?? { start: "", end: "", pauseStart: "", pauseEnd: "", rest: false };
}

type View = "login" | "modeSelect" | "templateEdit" | "main";

const TimeTrackingPage = () => {
  const navigate = useNavigate();
  const [info, setInfo] = useState<WorkerInfo>(() => readJson(INFO_KEY, { nom: "", prenom: "", agent: "" }));
  const [loginForm, setLoginForm] = useState<WorkerInfo>(() => readJson(INFO_KEY, { nom: "", prenom: "", agent: "" }));
  const [mode, setMode] = useState<SaveMode | null>(() => {
    const i = readJson<WorkerInfo>(INFO_KEY, { nom: "", prenom: "", agent: "" });
    if (!i.agent) return null;
    return (localStorage.getItem(modeKeyFor(i.agent)) as SaveMode | null);
  });
  const [template, setTemplate] = useState<DayTemplate[]>(() => {
    const i = readJson<WorkerInfo>(INFO_KEY, { nom: "", prenom: "", agent: "" });
    return readJson<DayTemplate[]>(tplKeyFor(i.agent), DEFAULT_TEMPLATE);
  });
  const [view, setView] = useState<View>(() => {
    const i = readJson<WorkerInfo>(INFO_KEY, { nom: "", prenom: "", agent: "" });
    if (!(i.nom && i.prenom && i.agent)) return "login";
    const m = localStorage.getItem(modeKeyFor(i.agent)) as SaveMode | null;
    if (!m) return "modeSelect";
    return "main";
  });

  const [days, setDays] = useState<WorkDay[]>(() => readJson(daysKeyFor(info.agent), []));
  const [period, setPeriod] = useState<"10" | "month" | "all">("month");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmModeChange, setConfirmModeChange] = useState(false);

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

  // Édition du modèle hebdomadaire (brouillon)
  const [tplDraft, setTplDraft] = useState<DayTemplate[]>(template);

  const blankForm = (date = today()): WorkDay => {
    if (mode === "auto") {
      const s = scheduleFor(date, template);
      return { id: "", date, start: s.start, end: s.end, pauseStart: s.pauseStart, pauseEnd: s.pauseEnd, cause: s.rest ? "Repos" : "", rest: s.rest };
    }
    return { id: "", date, start: "", end: "", pauseStart: "", pauseEnd: "", cause: "", rest: false };
  };
  const [form, setForm] = useState<WorkDay>(blankForm());

  // Quand on change la date en création (mode auto -> applique le modèle)
  useEffect(() => {
    if (editId) return;
    if (mode !== "auto") return;
    const s = scheduleFor(form.date, template);
    setForm(f => ({ ...f, start: s.start, end: s.end, pauseStart: s.pauseStart, pauseEnd: s.pauseEnd, rest: s.rest, cause: s.rest ? (f.cause || "Repos") : f.cause }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.date, mode]);

  // === Auto-sauvegarde silencieuse (fichier Documents survivant à la désinstallation) ===
  const AUTO_BACKUP_FILE = "staf-pointage-auto.json";
  const autoBackupTimer = useRef<number | null>(null);
  const writeAutoBackup = async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const dump: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k === INFO_KEY || k.startsWith("sabrinos_pointage_")) {
          const v = localStorage.getItem(k);
          if (v !== null) dump[k] = v;
        }
      }
      const payload = { type: "staf_pointage_backup", version: 1, exportedAt: new Date().toISOString(), data: dump };
      await Filesystem.writeFile({ path: AUTO_BACKUP_FILE, data: JSON.stringify(payload), directory: Directory.Documents, encoding: "utf8" as any });
    } catch { /* silencieux */ }
  };
  const scheduleAutoBackup = () => {
    if (autoBackupTimer.current) window.clearTimeout(autoBackupTimer.current);
    autoBackupTimer.current = window.setTimeout(writeAutoBackup, 800);
  };

  // Auto-restauration au démarrage si localStorage est vide mais fichier existe
  const [autoRestoreChecked, setAutoRestoreChecked] = useState(false);
  useEffect(() => {
    (async () => {
      if (!Capacitor.isNativePlatform()) { setAutoRestoreChecked(true); return; }
      // Détecte si les données du pointage sont manquantes (réinstall, vidage des données, etc.)
      const infoRaw = localStorage.getItem(INFO_KEY);
      let needsRestore = !infoRaw;
      if (!needsRestore && infoRaw) {
        try {
          const info = JSON.parse(infoRaw) as { agent?: string };
          if (info?.agent) {
            const daysRaw = localStorage.getItem(daysKeyFor(info.agent));
            const parsed = daysRaw ? JSON.parse(daysRaw) : [];
            if (!Array.isArray(parsed) || parsed.length === 0) needsRestore = true;
          }
        } catch { needsRestore = true; }
      }
      if (!needsRestore) { setAutoRestoreChecked(true); return; }
      try {
        const res = await Filesystem.readFile({ path: AUTO_BACKUP_FILE, directory: Directory.Documents, encoding: "utf8" as any });
        const text = typeof res.data === "string" ? res.data : "";
        const parsed = JSON.parse(text);
        const data: Record<string, string> = parsed?.data && typeof parsed.data === "object" ? parsed.data : parsed;
        const entries = Object.entries(data).filter(([k]) => k === INFO_KEY || k.startsWith("sabrinos_pointage_"));
        // Ne restaure que si la sauvegarde contient au moins un pointage non vide pour éviter d'écraser une vraie nouvelle session.
        const hasRealData = entries.some(([k, v]) => {
          if (!k.startsWith("sabrinos_pointage_days_")) return false;
          try { const arr = JSON.parse(String(v)); return Array.isArray(arr) && arr.length > 0; } catch { return false; }
        });
        if (entries.length > 0 && hasRealData) {
          for (const [k, v] of entries) localStorage.setItem(k, String(v));
          toast({ title: "✅ Pointage restauré automatiquement", description: `${entries.length} entrées récupérées` });
          setTimeout(() => window.location.reload(), 500);
          return;
        }
      } catch { /* pas de fichier de sauvegarde */ }
      setAutoRestoreChecked(true);
    })();
  }, []);

  const saveInfo = (next: WorkerInfo) => { setInfo(next); localStorage.setItem(INFO_KEY, JSON.stringify(next)); scheduleAutoBackup(); };

  const persistDays = (next: WorkDay[], agent = info.agent) => {
    const sorted = [...next].sort((a, b) => b.date.localeCompare(a.date));
    setDays(sorted);
    localStorage.setItem(daysKeyFor(agent), JSON.stringify(sorted));
    scheduleAutoBackup();
    return sorted;
  };

  const persistMode = (m: SaveMode, agent = info.agent) => {
    localStorage.setItem(modeKeyFor(agent), m);
    setMode(m);
    scheduleAutoBackup();
  };

  const persistTemplate = (tpl: DayTemplate[], agent = info.agent) => {
    localStorage.setItem(tplKeyFor(agent), JSON.stringify(tpl));
    setTemplate(tpl);
    scheduleAutoBackup();
  };

  // === Sauvegarde / Restauration des pointages (tous agents) ===
  const collectBackup = () => {
    const dump: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k === INFO_KEY || k.startsWith("sabrinos_pointage_")) {
        const v = localStorage.getItem(k);
        if (v !== null) dump[k] = v;
      }
    }
    return dump;
  };

  const handleExportBackup = async () => {
    const dump = collectBackup();
    const count = Object.keys(dump).length;
    if (count === 0) { toast({ title: "Aucune donnée à sauvegarder" }); return; }
    const payload = { type: "staf_pointage_backup", version: 1, exportedAt: new Date().toISOString(), data: dump };
    const json = JSON.stringify(payload, null, 2);
    const fileName = `staf-pointage-${new Date().toISOString().slice(0,10)}.json`;
    try {
      if (Capacitor.isNativePlatform()) {
        const saved = await saveTextToPhone(fileName, json);
        try {
          await sharePhoneFile({ uri: saved.uri, title: fileName, text: "Sauvegarde Pointage", dialogTitle: "Partager la sauvegarde", mimeType: "application/json" });
        } catch { /* fichier déjà enregistré */ }
      } else {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = fileName; a.click();
        URL.revokeObjectURL(url);
      }
      toast({ title: `✅ Sauvegarde créée`, description: `${count} entrées` });
    } catch (e: any) {
      toast({ title: "❌ Erreur sauvegarde", description: String(e?.message || e), variant: "destructive" });
    }
  };

  const handleImportBackup = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const data: Record<string, string> = parsed?.data && typeof parsed.data === "object" ? parsed.data : parsed;
        const entries = Object.entries(data).filter(([k]) => k === INFO_KEY || k.startsWith("sabrinos_pointage_"));
        if (entries.length === 0) throw new Error("Fichier vide ou invalide");
        const ok = window.confirm(`Restaurer ${entries.length} entrées ? Les pointages actuels seront remplacés.`);
        if (!ok) return;
        for (const [k, v] of entries) localStorage.setItem(k, String(v));
        toast({ title: `✅ Restauration réussie`, description: `${entries.length} entrées — rechargement…` });
        setTimeout(() => window.location.reload(), 600);
      } catch (err: any) {
        toast({ title: "❌ Erreur restauration", description: String(err?.message || err), variant: "destructive" });
      }
    };
    input.click();
  };

  // Recharge données quand on change d'agent / connexion
  useEffect(() => {
    if (view === "login") return;
    setDays(readJson(daysKeyFor(info.agent), []));
    setTemplate(readJson<DayTemplate[]>(tplKeyFor(info.agent), DEFAULT_TEMPLATE));
    setTplDraft(readJson<DayTemplate[]>(tplKeyFor(info.agent), DEFAULT_TEMPLATE));
  }, [info.agent, view]);

  // Auto-seed du jour courant (uniquement en mode auto)
  const autoSeededRef = useRef<string | null>(null);
  useEffect(() => {
    if (view !== "main" || mode !== "auto") return;
    const key = `${info.agent}|${today()}`;
    if (autoSeededRef.current === key) return;
    const existing = readJson<WorkDay[]>(daysKeyFor(info.agent), []);
    if (!existing.find(d => d.date === today())) {
      const t = today();
      const s = scheduleFor(t, template);
      const entry: WorkDay = {
        id: crypto.randomUUID(), date: t,
        start: s.start, end: s.end, pauseStart: s.pauseStart, pauseEnd: s.pauseEnd,
        cause: s.rest ? "Repos" : "", rest: s.rest,
      };
      persistDays([entry, ...existing], info.agent);
    }
    autoSeededRef.current = key;
  }, [view, mode, info.agent, template]);

  // Sauvegarde automatique (mode auto uniquement, sauf édition)
  const autoSaveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (view !== "main" || mode !== "auto") return;
    if (!form.date) return;
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      if (editId) return;
      if (!form.rest && !form.start && !form.end) return;
      const existing = days.find(d => d.date === form.date);
      const payload: WorkDay = { ...form, id: existing?.id || crypto.randomUUID() };
      delete payload.pauseMinutes;
      if (existing) persistDays(days.map(d => d.id === existing.id ? payload : d));
      else persistDays([payload, ...days]);
    }, 600);
    return () => { if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, view, mode]);

  const applyDefaults = () => {
    const s = scheduleFor(form.date, template);
    setForm(f => ({ ...f, ...s, cause: s.rest ? "Repos" : f.cause }));
    toast({ title: s.rest ? "Jour de repos (modèle)" : "Horaires du modèle appliqués" });
  };

  const toggleRest = () => {
    setForm(f => f.rest
      ? { ...f, rest: false, absenceType: undefined, cause: f.cause === "Repos" ? "" : f.cause }
      : { ...f, rest: true, absenceType: "repos", start: "", end: "", pauseStart: "", pauseEnd: "", cause: "Repos" });
  };

  const applyAbsenceRange = () => {
    const { type, from, to, cause } = absenceForm;
    if (!from || !to || from > to) { toast({ title: "Plage invalide", variant: "destructive" }); return; }
    const start = new Date(from + "T12:00:00");
    const end = new Date(to + "T12:00:00");
    const entries: WorkDay[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      entries.push({ id: crypto.randomUUID(), date: ds, start: "", end: "", pauseStart: "", pauseEnd: "", cause: cause || ABSENCE_LABEL[type], rest: true, absenceType: type });
    }
    const byDate = new Map(days.map(d => [d.date, d]));
    for (const e of entries) { const ex = byDate.get(e.date); byDate.set(e.date, { ...e, id: ex?.id || e.id }); }
    persistDays(Array.from(byDate.values()));
    setShowAbsenceDialog(false);
    toast({ title: `${ABSENCE_LABEL[type]} enregistrée`, description: `${entries.length} jour(s)` });
  };

  const submitForm = () => {
    if (!form.rest && (!form.date || !form.start || !form.end)) {
      toast({ title: "Date et horaires obligatoires", variant: "destructive" }); return;
    }
    const payload: WorkDay = { ...form };
    delete payload.pauseMinutes;
    if (editId) {
      persistDays(days.map(d => d.id === editId ? { ...payload, id: editId } : d));
      setEditId(null);
      setForm(blankForm());
      toast({ title: "Modification enregistrée" });
    } else {
      const existing = days.find(d => d.date === form.date);
      const entry = { ...payload, id: existing?.id || crypto.randomUUID() };
      if (existing) persistDays(days.map(d => d.id === existing.id ? entry : d));
      else persistDays([entry, ...days]);
      setForm(blankForm());
      const b = dayBreakdown(entry);
      toast({ title: "Enregistré", description: entry.rest ? "Repos" : `${formatHours(b.total)} (nuit ${formatHours(b.night)})` });
    }
  };

  const startEdit = (d: WorkDay) => { setEditId(d.id); setForm({ ...d }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const cancelEdit = () => { setEditId(null); setForm(blankForm()); };

  const filteredDays = useMemo(() => {
    const now = new Date();
    if (period === "all") return days;
    if (period === "10") {
      const min = new Date(now); min.setDate(now.getDate() - 9);
      const minKey = min.toISOString().slice(0, 10);
      return days.filter(d => d.date >= minKey);
    }
    return days.filter(d => d.date >= payrollRange.from && d.date <= payrollRange.to);
  }, [days, period, payrollRange.from, payrollRange.to]);

  const totals = filteredDays.reduce((acc, d) => { const b = dayBreakdown(d); acc.total += b.total; acc.night += b.night; acc.day += b.day; return acc; }, { total: 0, night: 0, day: 0 });
  const detailDay = detailId ? days.find(d => d.id === detailId) : null;
  const detailBreakdown = detailDay ? dayBreakdown(detailDay) : null;
  const detailHoliday = detailDay ? getHolidayName(detailDay.date) : null;
  const formHoliday = getHolidayName(form.date);
  const allHistorySorted = useMemo(() => [...days].sort((a, b) => a.date.localeCompare(b.date)), [days]);
  const historyTotals = allHistorySorted.reduce((acc, d) => { const b = dayBreakdown(d); acc.total += b.total; acc.night += b.night; acc.day += b.day; return acc; }, { total: 0, night: 0, day: 0 });

  const buildPdf = () => {
    const inRange = days.filter(d => d.date >= pdfRange.from && d.date <= pdfRange.to).sort((a, b) => a.date.localeCompare(b.date));
    if (inRange.length === 0) { toast({ title: "Aucun pointage sur cette période", variant: "destructive" }); return null; }
    const tot = inRange.reduce((acc, d) => { const b = dayBreakdown(d); acc.total += b.total; acc.night += b.night; acc.day += b.day; return acc; }, { total: 0, night: 0, day: 0 });
    const counts = inRange.reduce((acc, d) => { const a = absenceOf(d); if (a === "conge") acc.conge++; else if (a === "maladie") acc.maladie++; else if (a === "repos") acc.repos++; return acc; }, { conge: 0, maladie: 0, repos: 0 });
    const holidays = inRange.map(d => ({ date: d.date, name: getHolidayName(d.date) })).filter(h => h.name);
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const margin = 36;
    let y = margin;
    doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.text("Pointage – STAF Transport", margin, y); y += 26;
    doc.setFontSize(15); doc.text(`${info.nom || ""} ${info.prenom || ""}`.trim() || "—", margin, y); y += 20;
    doc.setFont("helvetica", "normal"); doc.setFontSize(13);
    doc.text(`N° agent : ${info.agent || "—"}`, margin, y); y += 18;
    doc.text(`Période : ${new Date(pdfRange.from).toLocaleDateString("fr-FR")}  au  ${new Date(pdfRange.to).toLocaleDateString("fr-FR")}`, margin, y); y += 24;
    const cols = [
      { w: 90, label: "Date" }, { w: 60, label: "Début" }, { w: 60, label: "Fin" }, { w: 60, label: "Pause" },
      { w: 65, label: "Total" }, { w: 65, label: "Nuit" }, { w: 65, label: "Jour" },
      { w: W - margin * 2 - (90 + 60 + 60 + 60 + 65 + 65 + 65), label: "Remarque" },
    ];
    const drawHeader = () => {
      doc.setFillColor(30, 30, 30); doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold"); doc.setFontSize(13);
      doc.rect(margin, y, W - margin * 2, 24, "F");
      let x = margin + 4;
      for (const c of cols) { doc.text(c.label, x, y + 16); x += c.w; }
      y += 24; doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal");
    };
    drawHeader();
    doc.setFontSize(12);
    for (const d of inRange) {
      if (y > H - margin - 80) { doc.addPage(); y = margin; drawHeader(); }
      const b = dayBreakdown(d);
      const abs = absenceOf(d);
      const holiday = getHolidayName(d.date);
      const pauseStr = abs ? "—" : (b.pauseMin > 0 ? `${Math.round(b.pauseMin)}m` : "—");
      const noteParts: string[] = [];
      if (abs) noteParts.push(ABSENCE_LABEL[abs]);
      if (holiday) noteParts.push("Férié");
      if (d.cause && d.cause !== ABSENCE_LABEL[abs as AbsenceType]) noteParts.push(d.cause);
      const row = [
        new Date(d.date).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" }),
        abs ? "—" : d.start, abs ? "—" : d.end, pauseStr,
        abs ? "—" : formatHours(b.total), abs ? "—" : formatHours(b.night), abs ? "—" : formatHours(b.day),
        noteParts.join(" • "),
      ];
      if (holiday) { doc.setFillColor(255, 240, 200); doc.rect(margin, y, W - margin * 2, 22, "F"); }
      else if (abs === "maladie") { doc.setFillColor(255, 220, 220); doc.rect(margin, y, W - margin * 2, 22, "F"); }
      else if (abs === "conge") { doc.setFillColor(220, 245, 220); doc.rect(margin, y, W - margin * 2, 22, "F"); }
      else if (abs === "repos") { doc.setFillColor(225, 235, 255); doc.rect(margin, y, W - margin * 2, 22, "F"); }
      let x = margin + 4;
      for (let i = 0; i < cols.length; i++) {
        const text = String(row[i] ?? "");
        const w = cols[i].w - 6;
        doc.text(doc.splitTextToSize(text, w) as string[], x, y + 15);
        x += cols[i].w;
      }
      doc.setDrawColor(200); doc.line(margin, y + 22, W - margin, y + 22);
      y += 22;
    }
    y += 18;
    if (y > H - margin - 120) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(15);
    doc.text(`Total : ${formatHours(tot.total)}`, margin, y); y += 20;
    doc.text(`Heures de nuit : ${formatHours(tot.night)}`, margin, y); y += 20;
    doc.text(`Heures de jour : ${formatHours(tot.day)}`, margin, y); y += 24;
    doc.setFontSize(13);
    doc.text(`Congés payés : ${counts.conge} j   •   Maladie : ${counts.maladie} j   •   Repos : ${counts.repos} j`, margin, y); y += 22;
    if (holidays.length) {
      if (y > H - margin - 80) { doc.addPage(); y = margin; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(13);
      doc.text("Jours fériés sur la période :", margin, y); y += 18;
      doc.setFont("helvetica", "normal"); doc.setFontSize(12);
      for (const h of holidays) {
        if (y > H - margin - 20) { doc.addPage(); y = margin; }
        doc.text(`• ${new Date(h.date).toLocaleDateString("fr-FR")} — ${h.name}`, margin + 6, y); y += 16;
      }
    }
    return doc;
  };

  const downloadPdf = async () => {
    const doc = buildPdf(); if (!doc) return;
    const fileName = `pointage_${info.nom || "agent"}_${pdfRange.from}_${pdfRange.to}.pdf`.replace(/\s+/g, "_");
    if (Capacitor.isNativePlatform()) {
      try {
        const data = String(doc.output("datauristring")).split(",")[1];
        const saved = await saveBase64ToPhone(fileName, data);
        await sharePhoneFile({ uri: saved.uri, title: fileName, text: "Pointage PDF", dialogTitle: "Partager le PDF", mimeType: "application/pdf" });
        setShowPdfDialog(false);
        toast({ title: "✅ PDF enregistré", description: saved.label });
        return;
      } catch (error) {
        console.error("Erreur export PDF mobile", error);
        toast({ title: "Partage impossible", description: "J'ouvre le téléchargement classique.", variant: "destructive" });
      }
    }
    doc.save(fileName); setShowPdfDialog(false);
    toast({ title: "PDF téléchargé", description: fileName });
  };
  const previewPdf = () => {
    const doc = buildPdf(); if (!doc) return;
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    setPdfPreviewUrl(URL.createObjectURL(doc.output("blob")));
  };
  useEffect(() => () => { if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl); }, [pdfPreviewUrl]);

  const handleLogin = () => {
    const v: WorkerInfo = { nom: loginForm.nom.trim(), prenom: loginForm.prenom.trim(), agent: loginForm.agent.trim() };
    if (!v.nom || !v.prenom || !v.agent) { toast({ title: "Nom, prénom et n° agent requis", variant: "destructive" }); return; }
    saveInfo(v);
    const existingMode = localStorage.getItem(modeKeyFor(v.agent)) as SaveMode | null;
    if (existingMode) { setMode(existingMode); setView("main"); }
    else { setMode(null); setView("modeSelect"); }
  };

  const handleSwitchAgent = () => {
    setView("login"); setLoginForm(info); setEditId(null); setForm(blankForm());
  };

  const chooseMode = (m: SaveMode) => {
    persistMode(m);
    if (m === "auto") {
      setTplDraft(readJson<DayTemplate[]>(tplKeyFor(info.agent), DEFAULT_TEMPLATE));
      setView("templateEdit");
    } else {
      setForm({ id: "", date: today(), start: "", end: "", pauseStart: "", pauseEnd: "", cause: "", rest: false });
      setView("main");
    }
  };

  const saveTemplateAndGo = () => {
    persistTemplate(tplDraft);
    autoSeededRef.current = null; // re-seed avec le nouveau modèle
    setForm(blankForm());
    setView("main");
    toast({ title: "Modèle hebdomadaire enregistré" });
  };

  // =============== LOGIN ===============
  if (view === "login") {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        <TruckLogo />
        <div className="flex items-center gap-3 px-4 py-2">
          <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-gray-800"><ArrowLeft size={20}/></button>
          <h1 className="text-2xl font-black">POINTAGE</h1>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl p-5 space-y-4">
            <h2 className="text-2xl font-black text-center text-green-400">Identification</h2>
            <p className="text-sm text-gray-400 text-center">Chaque agent retrouve son propre pointage.</p>
            <label className="block"><span className="text-sm text-gray-300">Nom</span>
              <input value={loginForm.nom} onChange={e => setLoginForm({ ...loginForm, nom: e.target.value })} placeholder="Nom" autoFocus className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white text-lg" /></label>
            <label className="block"><span className="text-sm text-gray-300">Prénom</span>
              <input value={loginForm.prenom} onChange={e => setLoginForm({ ...loginForm, prenom: e.target.value })} placeholder="Prénom" className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white text-lg" /></label>
            <label className="block"><span className="text-sm text-gray-300">Numéro d'agent</span>
              <input value={loginForm.agent} onChange={e => setLoginForm({ ...loginForm, agent: e.target.value })} placeholder="N° agent" className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white text-lg" /></label>
            <button onClick={handleLogin} className="w-full rounded-xl bg-green-700 hover:bg-green-600 p-4 flex items-center justify-center gap-2 font-bold text-lg"><LogIn size={22}/> Valider</button>
          </div>
        </div>
      </div>
    );
  }

  // =============== CHOIX DU MODE ===============
  if (view === "modeSelect") {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        <TruckLogo />
        <div className="flex items-center gap-3 px-4 py-2">
          <button onClick={() => setView(mode ? "main" : "login")} className="p-2 rounded-lg bg-gray-800"><ArrowLeft size={20}/></button>
          <h1 className="text-2xl font-black">MODE D'ENREGISTREMENT</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
          <p className="text-center text-gray-300 text-base">Bonjour <span className="font-bold text-green-400">{info.prenom}</span> — comment souhaitez-vous enregistrer vos pointages&nbsp;?</p>
          <button onClick={() => chooseMode("auto")} className="w-full max-w-md rounded-2xl bg-gradient-to-br from-green-700 to-emerald-800 p-6 flex flex-col items-center gap-2 font-bold text-lg border-2 border-green-400 active:scale-95 transition">
            <Zap size={36}/> ENREGISTREMENT AUTOMATIQUE
            <span className="text-xs font-normal text-green-100 text-center">Modèle hebdomadaire (Sam→Ven). L'app pointe chaque jour à votre place — vous pouvez toujours modifier.</span>
          </button>
          <button onClick={() => chooseMode("manual")} className="w-full max-w-md rounded-2xl bg-gradient-to-br from-blue-700 to-indigo-800 p-6 flex flex-col items-center gap-2 font-bold text-lg border-2 border-blue-400 active:scale-95 transition">
            <Hand size={36}/> ENREGISTREMENT MANUEL
            <span className="text-xs font-normal text-blue-100 text-center">Vous saisissez chaque journée à la main et cliquez sur Enregistrer.</span>
          </button>
        </div>
      </div>
    );
  }

  // =============== ÉDITION DU MODÈLE HEBDO ===============
  if (view === "templateEdit") {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        <TruckLogo />
        <div className="flex items-center gap-3 px-4 py-2">
          <button onClick={() => setView("modeSelect")} className="p-2 rounded-lg bg-gray-800"><ArrowLeft size={20}/></button>
          <h1 className="text-xl font-black flex-1">MODÈLE HEBDOMADAIRE</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div className="bg-gray-900 border border-green-600 rounded-xl p-3 text-sm">
            <p className="font-bold text-green-400 mb-1">Mode automatique actif</p>
            <p className="text-gray-300">Réglez vos horaires habituels pour chaque jour (du Samedi au Vendredi). Les jours fériés et tout pointage individuel restent modifiables ensuite.</p>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setTplDraft(DEFAULT_TEMPLATE)} className="text-xs bg-gray-700 rounded-lg px-3 py-2 font-bold">Préréglage 5/7 nuit</button>
              <button onClick={() => setTplDraft(BLANK_TEMPLATE)} className="text-xs bg-gray-700 rounded-lg px-3 py-2 font-bold">Tout vider</button>
            </div>
          </div>

          {WEEK_ORDER.map((dow) => {
            const t = tplDraft[dow];
            const update = (patch: Partial<DayTemplate>) => {
              const next = [...tplDraft];
              next[dow] = { ...next[dow], ...patch };
              if (patch.rest) { next[dow].start = ""; next[dow].end = ""; next[dow].pauseStart = ""; next[dow].pauseEnd = ""; }
              setTplDraft(next);
            };
            return (
              <div key={dow} className={`rounded-xl border p-3 ${t.rest ? "bg-blue-950/40 border-blue-500" : "bg-gray-900 border-gray-700"}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-black text-lg">{DAY_LABELS[dow]}</p>
                  <button onClick={() => update({ rest: !t.rest })} className={`px-3 py-1 rounded-lg text-xs font-bold ${t.rest ? "bg-blue-600" : "bg-gray-700"}`}>
                    {t.rest ? "🛌 REPOS" : "Repos ?"}
                  </button>
                </div>
                {!t.rest && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-gray-300">Début
                      <input type="time" value={t.start} onChange={e => update({ start: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-2 text-white text-base" />
                    </label>
                    <label className="text-xs text-gray-300">Fin
                      <input type="time" value={t.end} onChange={e => update({ end: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-2 text-white text-base" />
                    </label>
                    <label className="text-xs text-gray-300">Pause début
                      <input type="time" value={t.pauseStart} onChange={e => update({ pauseStart: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-2 text-white text-base" />
                    </label>
                    <label className="text-xs text-gray-300">Pause fin
                      <input type="time" value={t.pauseEnd} onChange={e => update({ pauseEnd: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-2 text-white text-base" />
                    </label>
                  </div>
                )}
              </div>
            );
          })}

          <button onClick={saveTemplateAndGo} className="w-full sticky bottom-0 rounded-xl bg-green-700 p-4 font-black text-lg flex items-center justify-center gap-2">
            <Check size={22}/> Enregistrer le modèle
          </button>
        </div>
      </div>
    );
  }

  // =============== MAIN ===============
  return (
    <div className="min-h-screen bg-black flex flex-col text-white">
      <TruckLogo />
      <div className="flex items-center gap-3 px-4 py-2">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-gray-800"><ArrowLeft size={20}/></button>
        <h1 className="text-2xl font-black flex-1">POINTAGE</h1>
        <button onClick={handleSwitchAgent} className="p-2 rounded-lg bg-gray-800 flex items-center gap-1 text-xs font-bold"><UserCog size={16}/> Changer</button>
      </div>

      <div className="flex-1 px-4 pb-4 space-y-3 overflow-y-auto">
        {/* Identité + mode */}
        <section className="bg-gray-900 border border-green-600 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-black">{info.nom} {info.prenom}</p>
              <p className="text-xs text-gray-400">Agent n° <span className="text-green-400 font-bold">{info.agent}</span></p>
            </div>
            <div className={`text-[10px] font-bold ${mode === "auto" ? "text-green-400" : "text-blue-400"}`}>
              ● {mode === "auto" ? "AUTO" : "MANUEL"}
            </div>
          </div>
          <button onClick={() => setConfirmModeChange(true)} className="w-full text-xs bg-gray-800 hover:bg-gray-700 rounded-lg py-2 px-3 font-bold flex items-center justify-center gap-2 border border-gray-700">
            <Settings2 size={14}/> Modifier le mode d'enregistrement
          </button>
          {mode === "auto" && (
            <button onClick={() => { setTplDraft(template); setView("templateEdit"); }} className="w-full text-xs bg-gray-800 hover:bg-gray-700 rounded-lg py-2 px-3 font-bold flex items-center justify-center gap-2 border border-gray-700">
              <CalendarDays size={14}/> Modifier le modèle hebdomadaire
            </button>
          )}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button onClick={handleExportBackup} className="text-xs bg-purple-700 hover:bg-purple-600 rounded-lg py-2 px-2 font-bold flex items-center justify-center gap-2">
              <Save size={14}/> Sauvegarder pointages
            </button>
            <button onClick={handleImportBackup} className="text-xs bg-purple-600 hover:bg-purple-500 rounded-lg py-2 px-2 font-bold flex items-center justify-center gap-2">
              <Upload size={14}/> Restaurer pointages
            </button>
          </div>
        </section>

        {/* Saisie */}
        <section className="bg-gray-900 border border-gray-700 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-bold text-base">{editId ? "✏️ Modifier la journée" : "➕ Journée"}</p>
            {editId && <button onClick={cancelEdit} className="text-xs bg-gray-700 px-2 py-1 rounded">Annuler</button>}
          </div>

          {formHoliday && <div className="bg-yellow-900/40 border border-yellow-500 rounded-lg px-3 py-2 text-yellow-200 text-sm font-bold">🎉 Jour férié : {formHoliday}</div>}

          <label className="block text-sm text-gray-300">Date
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-3 text-white text-base" />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <button onClick={applyDefaults} className="rounded-lg bg-gray-700 p-2 flex items-center justify-center gap-1 text-xs font-bold"><CalendarDays size={14}/> Modèle</button>
            <button onClick={toggleRest} className={`rounded-lg p-2 flex items-center justify-center gap-1 text-xs font-bold ${form.rest ? "bg-blue-700" : "bg-gray-700"}`}>🛌 {form.rest ? "REPOS ✓" : "Repos"}</button>
            <button onClick={() => setShowAbsenceDialog(true)} className="rounded-lg bg-emerald-700 p-2 flex items-center justify-center gap-1 text-xs font-bold"><Heart size={14}/> Congé/Mal.</button>
          </div>

          {!form.rest && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm text-gray-300">Début travail
                <input type="time" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-3 text-white text-base" /></label>
              <label className="text-sm text-gray-300">Fin travail
                <input type="time" value={form.end} onChange={e => setForm({ ...form, end: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-3 text-white text-base" /></label>
              <label className="text-sm text-gray-300">Pause début
                <input type="time" value={form.pauseStart} onChange={e => setForm({ ...form, pauseStart: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-3 text-white text-base" /></label>
              <label className="text-sm text-gray-300">Pause fin
                <input type="time" value={form.pauseEnd} onChange={e => setForm({ ...form, pauseEnd: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-3 text-white text-base" /></label>
            </div>
          )}

          <input value={form.cause} onChange={e => setForm({ ...form, cause: e.target.value })} placeholder="Cause / remarque" className="w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white text-base" />

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
            {editId ? <><Check size={22}/> Enregistrer modification</> : (mode === "auto" ? <><Plus size={22}/> Confirmer (auto-sauvegardé)</> : <><Plus size={22}/> Enregistrer</>)}
          </button>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setShowHistory(true)} className="bg-blue-700 rounded-xl p-3 flex items-center justify-center gap-2 font-bold"><Eye size={18}/> Visualiser tout</button>
          <button onClick={() => setShowPdfDialog(true)} className="bg-purple-700 rounded-xl p-3 flex items-center justify-center gap-2 font-bold"><FileText size={18}/> PDF</button>
        </div>

        <section className="bg-gray-900 border border-gray-700 rounded-xl p-3">
          <select value={period} onChange={e => setPeriod(e.target.value as "10" | "month" | "all")} className="w-full mb-3 rounded-lg bg-gray-800 border border-gray-600 px-3 py-2 text-white">
            <option value="10">10 derniers jours</option>
            <option value="month">Mois de paie (25 → 24)</option>
            <option value="all">Tout</option>
          </select>
          <div className="text-center mb-3">
            <p className="text-base font-bold">Total période</p>
            <p className="text-3xl font-black text-green-400">{formatHours(totals.total)}</p>
            <p className="text-sm font-bold text-purple-300">nuit : {formatHours(totals.night)} • jour : {formatHours(totals.day)}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="border-b border-gray-700 text-left"><th className="py-2 pr-1">Date</th><th className="py-2 pr-1">H.</th><th className="py-2 pr-1">Nuit</th><th className="py-2"></th></tr></thead>
              <tbody>
                {filteredDays.map(day => {
                  const b = dayBreakdown(day);
                  const h = getHolidayName(day.date);
                  const abs = absenceOf(day);
                  return (
                    <tr key={day.id} className={`border-b border-gray-800 ${abs === "maladie" ? "bg-red-950/40" : abs === "conge" ? "bg-emerald-950/40" : abs ? "bg-blue-950/40" : ""}`}>
                      <td className="py-2 pr-1">
                        {new Date(day.date).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                        {h && <div className="text-[10px] text-yellow-400 font-bold">🎉 {h}</div>}
                        {abs && <div className={`text-[10px] font-bold ${abs === "maladie" ? "text-red-300" : abs === "conge" ? "text-emerald-300" : "text-blue-300"}`}>{ABSENCE_EMOJI[abs]} {ABSENCE_LABEL[abs]}</div>}
                      </td>
                      <td className="py-2 pr-1 font-bold">{abs ? "—" : formatHours(b.total)}</td>
                      <td className="py-2 pr-1 text-purple-300">{abs ? "—" : formatHours(b.night)}</td>
                      <td className="py-2 flex items-center gap-1">
                        <button onClick={() => setDetailId(day.id)} className="text-blue-400 p-1"><Eye size={14}/></button>
                        <button onClick={() => startEdit(day)} className="text-yellow-400 p-1"><Pencil size={14}/></button>
                        <button onClick={() => { if (confirm("Supprimer ce pointage ?")) persistDays(days.filter(d => d.id !== day.id)); }} className="text-red-400 p-1"><Trash2 size={14}/></button>
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

      {/* Confirm changement de mode */}
      {confirmModeChange && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={() => setConfirmModeChange(false)}>
          <div className="bg-gray-900 border-2 border-yellow-500 rounded-2xl p-5 max-w-md w-full space-y-3" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-black text-center">Modifier le mode ?</h2>
            <p className="text-sm text-gray-300 text-center">Voulez-vous modifier le mode d'enregistrement&nbsp;? Vos pointages déjà enregistrés sont conservés.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmModeChange(false)} className="flex-1 bg-gray-700 rounded-xl p-3 font-bold">Non</button>
              <button onClick={() => { setConfirmModeChange(false); setView("modeSelect"); }} className="flex-1 bg-yellow-600 rounded-xl p-3 font-bold">Oui, modifier</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Détail */}
      {detailDay && detailBreakdown && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={() => setDetailId(null)}>
          <div className="bg-gray-900 border-2 border-blue-500 rounded-2xl p-4 max-w-md w-full" onClick={e => e.stopPropagation()}>
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

      {/* Historique complet */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col" onClick={() => setShowHistory(false)}>
          <div className="bg-gray-900 m-2 rounded-2xl border-2 border-blue-500 flex-1 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
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
                <thead><tr className="border-b border-gray-700 text-left"><th className="py-1 pr-1">Date</th><th>Déb.</th><th>Fin</th><th>Pause</th><th>H.</th><th>Nuit</th></tr></thead>
                <tbody>
                  {allHistorySorted.map(d => {
                    const b = dayBreakdown(d);
                    const h = getHolidayName(d.date);
                    return (
                      <tr key={d.id} className={`border-b border-gray-800 ${d.rest ? "bg-blue-950/40" : ""}`}>
                        <td className="py-1 pr-1">{new Date(d.date).toLocaleDateString("fr-FR")}{h && <div className="text-[9px] text-yellow-400">🎉</div>}{d.rest && <div className="text-[9px] text-blue-300">🛌</div>}</td>
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
          <div className="bg-gray-900 border-2 border-purple-500 rounded-2xl p-4 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-black mb-2 text-center">Rapport PDF</h2>
            <p className="text-xs text-gray-400 mb-3 text-center">Par défaut : mois de paie (25 → 24)</p>
            {Capacitor.isNativePlatform() && <p className="text-xs text-green-300 mb-3 text-center">Sur téléphone : choisissez “Fichiers”, “Drive” ou “WhatsApp” après Télécharger.</p>}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <label className="block text-sm text-gray-300">Du
                <input type="date" value={pdfRange.from} onChange={e => setPdfRange({ ...pdfRange, from: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-2 text-white" /></label>
              <label className="block text-sm text-gray-300">Au
                <input type="date" value={pdfRange.to} onChange={e => setPdfRange({ ...pdfRange, to: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-2 text-white" /></label>
            </div>
            <button onClick={() => setPdfRange(payrollRange)} className="w-full mb-3 text-xs bg-gray-700 rounded-lg py-2 font-bold">↺ Mois de paie en cours</button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={previewPdf} className="bg-blue-700 rounded-xl p-3 font-bold flex items-center justify-center gap-2"><Eye size={16}/> Visualiser</button>
              <button onClick={downloadPdf} className="bg-purple-700 rounded-xl p-3 font-bold flex items-center justify-center gap-2"><Download size={16}/> Télécharger</button>
            </div>
            <button onClick={() => setShowPdfDialog(false)} className="w-full mt-2 bg-gray-700 rounded-xl p-2 text-sm font-bold">Fermer</button>
          </div>
        </div>
      )}

      {/* Aperçu PDF */}
      {pdfPreviewUrl && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <div className="flex items-center justify-between p-2 bg-gray-900 border-b border-gray-700">
            <h2 className="font-black">Aperçu PDF</h2>
            <div className="flex gap-2">
              <a href={pdfPreviewUrl} download={`pointage_${info.nom || "agent"}_${pdfRange.from}_${pdfRange.to}.pdf`.replace(/\s+/g, "_")} className="bg-purple-700 rounded-lg px-3 py-2 text-sm font-bold flex items-center gap-1"><Download size={14}/> Télécharger</a>
              <button onClick={() => { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }} className="bg-gray-700 rounded-lg p-2"><X size={18}/></button>
            </div>
          </div>
          <iframe src={pdfPreviewUrl} title="Aperçu" className="flex-1 w-full bg-white" />
        </div>
      )}

      {/* Modal Congé / Maladie */}
      {showAbsenceDialog && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={() => setShowAbsenceDialog(false)}>
          <div className="bg-gray-900 border-2 border-emerald-500 rounded-2xl p-4 max-w-md w-full space-y-3" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-black text-center">Congé / Maladie / Repos</h2>
            <div className="grid grid-cols-3 gap-2">
              {(["conge", "maladie", "repos"] as AbsenceType[]).map(t => (
                <button key={t} onClick={() => setAbsenceForm({ ...absenceForm, type: t })} className={`rounded-lg p-3 text-sm font-bold flex flex-col items-center gap-1 ${absenceForm.type === t ? (t === "maladie" ? "bg-red-700" : t === "conge" ? "bg-emerald-700" : "bg-blue-700") : "bg-gray-700"}`}>
                  <span className="text-xl">{ABSENCE_EMOJI[t]}</span>{ABSENCE_LABEL[t]}
                </button>
              ))}
            </div>
            <label className="block text-sm text-gray-300">Date début
              <input type="date" value={absenceForm.from} onChange={e => setAbsenceForm({ ...absenceForm, from: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-3 text-white text-base" /></label>
            <label className="block text-sm text-gray-300">Date fin
              <input type="date" value={absenceForm.to} onChange={e => setAbsenceForm({ ...absenceForm, to: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-3 text-white text-base" /></label>
            <input value={absenceForm.cause} onChange={e => setAbsenceForm({ ...absenceForm, cause: e.target.value })} placeholder="Remarque (optionnel)" className="w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white text-base" />
            <div className="flex gap-2">
              <button onClick={() => setShowAbsenceDialog(false)} className="flex-1 bg-gray-700 rounded-xl p-3 font-bold">Annuler</button>
              <button onClick={applyAbsenceRange} className="flex-1 bg-emerald-700 rounded-xl p-3 font-bold flex items-center justify-center gap-2"><Check size={18}/> Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeTrackingPage;
