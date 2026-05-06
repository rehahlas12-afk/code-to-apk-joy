import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, Plus, Printer, Trash2, Pencil, FileText, X, Check } from "lucide-react";
import TruckLogo from "@/components/TruckLogo";
import { toast } from "@/hooks/use-toast";

interface WorkDay {
  id: string;
  date: string;
  start: string;
  end: string;
  pauseMinutes: number;
  cause: string;
}

interface WorkerInfo {
  nom: string;
  prenom: string;
  agent: string;
}

const DAYS_KEY = "sabrinos_pointage_days";
const INFO_KEY = "sabrinos_pointage_info";

const NIGHT_START = 21 * 60;
const NIGHT_END = 6 * 60;

const PAUSE_PRESETS = [10, 15, 20, 30, 45, 60, 90, 120];

const today = () => new Date().toISOString().slice(0, 10);

function readJson<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) as T : fallback;
  } catch {
    return fallback;
  }
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function dayBreakdown(day: WorkDay): { total: number; night: number } {
  if (!day.start || !day.end) return { total: 0, night: 0 };
  const startM = toMinutes(day.start);
  let endM = toMinutes(day.end);
  if (endM <= startM) endM += 24 * 60;
  const pause = Math.max(0, Number(day.pauseMinutes) || 0);
  const totalMin = Math.max(0, endM - startM - pause);

  const windows = [
    { s: NIGHT_START, e: 24 * 60 + NIGHT_END },
    { s: 24 * 60 + NIGHT_START, e: 48 * 60 + NIGHT_END },
    { s: -24 * 60 + NIGHT_START, e: NIGHT_END },
  ];
  let nightMinRaw = 0;
  for (const w of windows) {
    const s = Math.max(startM, w.s);
    const e = Math.min(endM, w.e);
    if (e > s) nightMinRaw += e - s;
  }
  const grossMin = Math.max(1, endM - startM);
  const nightMin = Math.max(0, nightMinRaw - (pause * nightMinRaw) / grossMin);
  return { total: totalMin / 60, night: nightMin / 60 };
}

function formatHours(value: number): string {
  if (!isFinite(value) || value <= 0) return "0h00";
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  return `${hours}h${String(minutes).padStart(2, "0")}`;
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

  const blankForm = (): WorkDay => ({
    id: "",
    date: today(),
    start: "08:00",
    end: "16:00",
    pauseMinutes: 30,
    cause: "",
  });
  const [form, setForm] = useState<WorkDay>(blankForm());

  const saveInfo = (next: WorkerInfo) => {
    setInfo(next);
    localStorage.setItem(INFO_KEY, JSON.stringify(next));
  };

  const saveDays = (next: WorkDay[]) => {
    const sorted = [...next].sort((a, b) => b.date.localeCompare(a.date));
    setDays(sorted);
    localStorage.setItem(DAYS_KEY, JSON.stringify(sorted));
  };

  const submitForm = () => {
    if (!form.date || !form.start || !form.end) {
      toast({ title: "Date et horaires obligatoires", variant: "destructive" });
      return;
    }
    if (editId) {
      const next = days.map(d => d.id === editId ? { ...form, id: editId, pauseMinutes: Number(form.pauseMinutes) || 0 } : d);
      saveDays(next);
      setEditId(null);
      setForm(blankForm());
      toast({ title: "Pointage modifié" });
    } else {
      const entry = { ...form, id: crypto.randomUUID(), pauseMinutes: Number(form.pauseMinutes) || 0 };
      saveDays([entry, ...days]);
      setForm(blankForm());
      const b = dayBreakdown(entry);
      toast({ title: "Pointage ajouté", description: `${formatHours(b.total)} (dont ${formatHours(b.night)} nuit)` });
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
      const min = new Date(now);
      min.setDate(now.getDate() - 9);
      const minKey = min.toISOString().slice(0, 10);
      return days.filter((day) => day.date >= minKey);
    }
    const monthKey = now.toISOString().slice(0, 7);
    return days.filter((day) => day.date.startsWith(monthKey));
  }, [days, period]);

  const totals = filteredDays.reduce((acc, day) => {
    const b = dayBreakdown(day);
    acc.total += b.total;
    acc.night += b.night;
    return acc;
  }, { total: 0, night: 0 });

  const detailDay = detailId ? days.find(d => d.id === detailId) : null;
  const detailBreakdown = detailDay ? dayBreakdown(detailDay) : null;

  const allHistorySorted = useMemo(() => [...days].sort((a, b) => a.date.localeCompare(b.date)), [days]);
  const historyTotals = allHistorySorted.reduce((acc, d) => {
    const b = dayBreakdown(d);
    acc.total += b.total; acc.night += b.night; return acc;
  }, { total: 0, night: 0 });

  const generatePdf = () => {
    const inRange = days.filter(d => d.date >= pdfRange.from && d.date <= pdfRange.to)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (inRange.length === 0) {
      toast({ title: "Aucun pointage sur cette période", variant: "destructive" });
      return;
    }
    const tot = inRange.reduce((acc, d) => {
      const b = dayBreakdown(d);
      acc.total += b.total; acc.night += b.night; return acc;
    }, { total: 0, night: 0 });

    const rows = inRange.map(d => {
      const b = dayBreakdown(d);
      return `<tr>
        <td>${new Date(d.date).toLocaleDateString("fr-FR")}</td>
        <td>${d.start}</td><td>${d.end}</td><td>${d.pauseMinutes}m</td>
        <td><b>${formatHours(b.total)}</b></td>
        <td>${formatHours(b.night)}</td>
        <td>${d.cause || ""}</td>
      </tr>`;
    }).join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Pointage ${info.nom} ${info.prenom}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#000;padding:20px;}
        h1{margin:0 0 4px;font-size:22px}
        .meta{font-size:14px;margin-bottom:10px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{border:1px solid #333;padding:6px;text-align:left}
        th{background:#eee}
        .tot{margin-top:14px;font-size:16px;font-weight:bold}
      </style></head><body>
      <h1>Pointage – ${info.nom} ${info.prenom}</h1>
      <div class="meta">N° agent: <b>${info.agent || "—"}</b> &nbsp;•&nbsp; Période: <b>${new Date(pdfRange.from).toLocaleDateString("fr-FR")}</b> au <b>${new Date(pdfRange.to).toLocaleDateString("fr-FR")}</b></div>
      <table><thead><tr><th>Date</th><th>Début</th><th>Fin</th><th>Pause</th><th>Heures</th><th>Nuit</th><th>Cause</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="tot">Total: ${formatHours(tot.total)} &nbsp;•&nbsp; dont nuit: ${formatHours(tot.night)}</div>
      <script>window.onload=()=>{window.print();}</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast({ title: "Activez les pop-ups pour le PDF", variant: "destructive" }); return; }
    w.document.write(html);
    w.document.close();
    setShowPdfDialog(false);
  };

  return (
    <div className="min-h-screen bg-black flex flex-col text-white">
      <TruckLogo />
      <div className="flex items-center gap-3 px-4 py-2 print:hidden">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-gray-800">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-black">POINTAGE</h1>
      </div>

      <div className="flex-1 px-4 pb-4 space-y-3 overflow-y-auto">
        {/* Identité */}
        <section className="bg-gray-900 border border-gray-700 rounded-xl p-3 grid grid-cols-1 gap-2">
          <input value={info.nom} onChange={(e) => saveInfo({ ...info, nom: e.target.value })} placeholder="Nom" className="rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white" />
          <input value={info.prenom} onChange={(e) => saveInfo({ ...info, prenom: e.target.value })} placeholder="Prénom" className="rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white" />
          <input value={info.agent} onChange={(e) => saveInfo({ ...info, agent: e.target.value })} placeholder="Numéro d'agent" className="rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white" />
        </section>

        {/* Saisie */}
        <section className="bg-gray-900 border border-gray-700 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-bold text-base">{editId ? "✏️ Modifier la journée" : "➕ Nouvelle journée"}</p>
            {editId && (
              <button onClick={cancelEdit} className="text-xs bg-gray-700 px-2 py-1 rounded">Annuler</button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm text-gray-300">Date
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-3 text-white" />
            </label>
            <label className="text-sm text-gray-300">Pause (min)
              <input type="number" inputMode="numeric" value={form.pauseMinutes} onChange={(e) => setForm({ ...form, pauseMinutes: Number(e.target.value) })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-3 text-white" />
            </label>
            <label className="text-sm text-gray-300">Début
              <input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-3 text-white" />
            </label>
            <label className="text-sm text-gray-300">Fin
              <input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-3 text-white" />
            </label>
          </div>
          {/* Pause rapide */}
          <div>
            <p className="text-xs text-gray-400 mb-1">Pause rapide :</p>
            <div className="flex flex-wrap gap-1">
              {PAUSE_PRESETS.map(p => (
                <button key={p} onClick={() => setForm({ ...form, pauseMinutes: p })}
                  className={`px-3 py-1 rounded-lg text-sm font-bold ${form.pauseMinutes === p ? "bg-blue-600" : "bg-gray-700"}`}>
                  {p < 60 ? `${p}min` : `${p/60}h${p%60 ? (p%60) : ""}`}
                </button>
              ))}
            </div>
          </div>
          <input value={form.cause} onChange={(e) => setForm({ ...form, cause: e.target.value })} placeholder="Cause / remarque" className="w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white" />
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
          <div className="flex items-center gap-2 mb-3">
            <select value={period} onChange={(e) => setPeriod(e.target.value as "10" | "month" | "all")} className="flex-1 rounded-lg bg-gray-800 border border-gray-600 px-3 py-2 text-white">
              <option value="10">10 derniers jours</option>
              <option value="month">Ce mois</option>
              <option value="all">Tout</option>
            </select>
            <button onClick={() => window.print()} className="rounded-lg bg-blue-700 p-2" title="Imprimer">
              <Printer size={20} />
            </button>
          </div>

          <div className="text-center mb-3">
            <p className="text-base font-bold">Total période</p>
            <p className="text-3xl font-black text-green-400">{formatHours(totals.total)}</p>
            <p className="text-sm font-bold text-purple-300">dont nuit : {formatHours(totals.night)}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-700 text-left">
                  <th className="py-2 pr-1">Date</th>
                  <th className="py-2 pr-1">Début</th>
                  <th className="py-2 pr-1">Fin</th>
                  <th className="py-2 pr-1">H.</th>
                  <th className="py-2 pr-1">Nuit</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredDays.map((day) => {
                  const b = dayBreakdown(day);
                  return (
                    <tr key={day.id} className="border-b border-gray-800">
                      <td className="py-2 pr-1">{new Date(day.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</td>
                      <td className="py-2 pr-1">{day.start}</td>
                      <td className="py-2 pr-1">{day.end}</td>
                      <td className="py-2 pr-1 font-bold">{formatHours(b.total)}</td>
                      <td className="py-2 pr-1 text-purple-300">{formatHours(b.night)}</td>
                      <td className="py-2 flex items-center gap-1">
                        <button onClick={() => setDetailId(day.id)} className="text-blue-400 p-1" title="Détail">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => startEdit(day)} className="text-yellow-400 p-1" title="Modifier">
                          <Pencil size={14} />
                        </button>
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
            <h2 className="text-xl font-black text-center mb-3">Détail journée</h2>
            <p className="text-center text-2xl font-bold text-blue-400 mb-3">{new Date(detailDay.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p>
            <table className="w-full text-base">
              <tbody>
                <tr className="border-b border-gray-700"><td className="py-2 text-gray-400">Début</td><td className="py-2 font-bold text-right">{detailDay.start}</td></tr>
                <tr className="border-b border-gray-700"><td className="py-2 text-gray-400">Fin</td><td className="py-2 font-bold text-right">{detailDay.end}</td></tr>
                <tr className="border-b border-gray-700"><td className="py-2 text-gray-400">Pause</td><td className="py-2 font-bold text-right">{detailDay.pauseMinutes} min</td></tr>
                <tr className="border-b border-gray-700"><td className="py-2 text-gray-400">Total</td><td className="py-2 font-black text-right text-green-400 text-xl">{formatHours(detailBreakdown.total)}</td></tr>
                <tr className="border-b border-gray-700"><td className="py-2 text-gray-400">Nuit</td><td className="py-2 font-black text-right text-purple-300 text-xl">{formatHours(detailBreakdown.night)}</td></tr>
                <tr className="border-b border-gray-700"><td className="py-2 text-gray-400">Jour</td><td className="py-2 font-bold text-right">{formatHours(Math.max(0, detailBreakdown.total - detailBreakdown.night))}</td></tr>
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
              <p className="text-xs text-purple-300">dont nuit {formatHours(historyTotals.night)}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-gray-700 text-left">
                  <th className="py-1 pr-1">Date</th><th>Déb.</th><th>Fin</th><th>Pause</th><th>Heures</th><th>Nuit</th>
                </tr></thead>
                <tbody>
                  {allHistorySorted.map(d => {
                    const b = dayBreakdown(d);
                    return (
                      <tr key={d.id} className="border-b border-gray-800">
                        <td className="py-1 pr-1">{new Date(d.date).toLocaleDateString("fr-FR")}</td>
                        <td>{d.start}</td><td>{d.end}</td><td>{d.pauseMinutes}m</td>
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
            <p className="text-xs text-gray-400 mb-2">Choisissez la période (jusqu'à 30 jours ou plus)</p>
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
