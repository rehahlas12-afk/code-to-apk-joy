import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Printer, Trash2 } from "lucide-react";
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

function dayHours(day: WorkDay): number {
  if (!day.start || !day.end) return 0;
  let diff = toMinutes(day.end) - toMinutes(day.start);
  if (diff < 0) diff += 24 * 60;
  return Math.max(0, diff - (Number(day.pauseMinutes) || 0)) / 60;
}

function formatHours(value: number): string {
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

const TimeTrackingPage = () => {
  const navigate = useNavigate();
  const [info, setInfo] = useState<WorkerInfo>(() => readJson(INFO_KEY, { nom: "", prenom: "", agent: "" }));
  const [days, setDays] = useState<WorkDay[]>(() => readJson(DAYS_KEY, []));
  const [period, setPeriod] = useState<"10" | "month" | "all">("month");
  const [form, setForm] = useState<WorkDay>({
    id: "",
    date: today(),
    start: "08:00",
    end: "16:00",
    pauseMinutes: 30,
    cause: "",
  });

  const saveInfo = (next: WorkerInfo) => {
    setInfo(next);
    localStorage.setItem(INFO_KEY, JSON.stringify(next));
  };

  const saveDays = (next: WorkDay[]) => {
    const sorted = [...next].sort((a, b) => b.date.localeCompare(a.date));
    setDays(sorted);
    localStorage.setItem(DAYS_KEY, JSON.stringify(sorted));
  };

  const addDay = () => {
    if (!form.date || !form.start || !form.end) {
      toast({ title: "Date et horaires obligatoires", variant: "destructive" });
      return;
    }
    const entry = { ...form, id: crypto.randomUUID(), pauseMinutes: Number(form.pauseMinutes) || 0 };
    saveDays([entry, ...days]);
    setForm({ ...form, date: today(), cause: "" });
    toast({ title: "Pointage ajouté", description: `${formatHours(dayHours(entry))} travaillées` });
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

  const total = filteredDays.reduce((sum, day) => sum + dayHours(day), 0);

  return (
    <div className="min-h-screen bg-black flex flex-col text-white">
      <TruckLogo />
      <div className="flex items-center gap-3 px-4 py-2 print:hidden">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-gray-800">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">Pointage nom prénom</h1>
      </div>

      <div className="flex-1 px-4 pb-4 space-y-3 overflow-y-auto print:bg-white print:text-black print:p-6">
        <section className="bg-gray-900 border border-gray-700 rounded-xl p-3 space-y-2 print:border-black print:bg-white">
          <div className="grid grid-cols-1 gap-2">
            <input value={info.nom} onChange={(e) => saveInfo({ ...info, nom: e.target.value })} placeholder="Nom" className="rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white print:text-black print:bg-white" />
            <input value={info.prenom} onChange={(e) => saveInfo({ ...info, prenom: e.target.value })} placeholder="Prénom" className="rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white print:text-black print:bg-white" />
            <input value={info.agent} onChange={(e) => saveInfo({ ...info, agent: e.target.value })} placeholder="Numéro d'agent" className="rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white print:text-black print:bg-white" />
          </div>
        </section>

        <section className="bg-gray-900 border border-gray-700 rounded-xl p-3 space-y-2 print:hidden">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm text-gray-300">Date
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-3 text-white" />
            </label>
            <label className="text-sm text-gray-300">Pause (min)
              <input type="number" inputMode="numeric" value={form.pauseMinutes} onChange={(e) => setForm({ ...form, pauseMinutes: Number(e.target.value) })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-3 text-white" />
            </label>
            <label className="text-sm text-gray-300">Début travail
              <input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-3 text-white" />
            </label>
            <label className="text-sm text-gray-300">Fin travail
              <input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-600 px-2 py-3 text-white" />
            </label>
          </div>
          <input value={form.cause} onChange={(e) => setForm({ ...form, cause: e.target.value })} placeholder="Cause / remarque" className="w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white" />
          <button onClick={addDay} className="w-full rounded-xl bg-green-700 p-4 flex items-center justify-center gap-2 font-bold text-lg">
            <Plus size={22} /> Ajouter la journée
          </button>
        </section>

        <section className="bg-gray-900 border border-gray-700 rounded-xl p-3 print:border-black print:bg-white">
          <div className="flex items-center gap-2 mb-3 print:hidden">
            <select value={period} onChange={(e) => setPeriod(e.target.value as "10" | "month" | "all")} className="flex-1 rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-white">
              <option value="10">10 derniers jours</option>
              <option value="month">Ce mois</option>
              <option value="all">Tout</option>
            </select>
            <button onClick={() => window.print()} className="rounded-lg bg-blue-700 p-3">
              <Printer size={22} />
            </button>
          </div>

          <div className="text-center mb-3">
            <p className="text-xl font-black">Résultat des heures travaillées</p>
            <p className="text-4xl font-black text-green-400 print:text-black">{formatHours(total)}</p>
            <p className="text-sm text-gray-400 print:text-black">{info.nom} {info.prenom} • Agent {info.agent || "—"}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-700 print:border-black text-left">
                  <th className="py-2 pr-2">Date</th>
                  <th className="py-2 pr-2">Début</th>
                  <th className="py-2 pr-2">Fin</th>
                  <th className="py-2 pr-2">Pause</th>
                  <th className="py-2 pr-2">Heures</th>
                  <th className="py-2 pr-2">Cause</th>
                  <th className="py-2 print:hidden"></th>
                </tr>
              </thead>
              <tbody>
                {filteredDays.map((day) => (
                  <tr key={day.id} className="border-b border-gray-800 print:border-black">
                    <td className="py-2 pr-2">{new Date(day.date).toLocaleDateString("fr-FR")}</td>
                    <td className="py-2 pr-2">{day.start}</td>
                    <td className="py-2 pr-2">{day.end}</td>
                    <td className="py-2 pr-2">{day.pauseMinutes}m</td>
                    <td className="py-2 pr-2 font-bold">{formatHours(dayHours(day))}</td>
                    <td className="py-2 pr-2">{day.cause}</td>
                    <td className="py-2 print:hidden">
                      <button onClick={() => saveDays(days.filter((d) => d.id !== day.id))} className="text-red-400 p-1">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredDays.length === 0 && <p className="text-center text-gray-500 py-6">Aucun pointage pour cette période.</p>}
        </section>
      </div>
    </div>
  );
};

export default TimeTrackingPage;