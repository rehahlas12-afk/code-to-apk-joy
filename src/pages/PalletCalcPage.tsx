import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mic, MicOff, Calculator, Trash2, Save, X, ChevronDown } from "lucide-react";
import TruckLogo from "@/components/TruckLogo";
import { toast } from "@/hooks/use-toast";
import palletRolls from "@/assets/pallets/pallet-rolls.jpg.asset.json";
import pallet12080 from "@/assets/pallets/pallet-120-80.jpg.asset.json";
import pallet120100 from "@/assets/pallets/pallet-120-100.jpg.asset.json";
import pallet10060 from "@/assets/pallets/pallet-100-60.jpg.asset.json";
import pallet8060 from "@/assets/pallets/pallet-80-60.jpg.asset.json";

const IMAGES: Record<string, string> = {
  roll: palletRolls.url,
  normale: pallet12080.url,
  eau: pallet120100.url,
  demi: pallet8060.url,
  demi_eau: pallet10060.url,
};

type EntryType = "roll" | "demi" | "normale" | "eau" | "demi_eau";

interface PalletEntry {
  type: EntryType;
  quantity: number;
}

interface SavedCalc {
  id: string;
  storeName: string;
  entries: PalletEntry[];
  total: number;
  date: string;
}

const MAX_PALETTES = 20.5;
const SAVED_KEY = "staf_pallet_calcs";

// Ratios "physiques" en palettes
const RATIO: Record<EntryType, number> = {
  roll: 0.64,
  demi: 0.5,
  demi_eau: 0.5,
  normale: 1,
  eau: 1.5, // grosse palette d'eau = 1.5 palettes
};

const LABEL: Record<EntryType, string> = {
  roll: "Rolls",
  demi: "Palette 80/60",
  demi_eau: "Palette 100/60",
  normale: "Palette 120/80",
  eau: "Palette 120/100",
};

function getSavedCalcs(): SavedCalc[] {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); } catch { return []; }
}
function setSavedCalcs(calcs: SavedCalc[]) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(calcs));
}

function calcSingle(e: PalletEntry): number {
  return e.quantity * (RATIO[e.type] ?? 1);
}

// Regroupement automatique : appaire les demis, gère le cas "1 eau seule = 1 normale"
function smartTotal(list: PalletEntry[]): { total: number; breakdown: string[] } {
  const counts: Record<EntryType, number> = { roll: 0, demi: 0, demi_eau: 0, demi_lait: 0, normale: 0, eau: 0 };
  for (const e of list) counts[e.type] += e.quantity;

  const breakdown: string[] = [];
  let total = 0;

  // Rolls
  if (counts.roll > 0) {
    const v = counts.roll * RATIO.roll;
    total += v;
    breakdown.push(`${counts.roll} roll → ${v.toFixed(2)} pal`);
  }

  // Demi eau : 2 = 1 eau (1.5)
  if (counts.demi_eau > 0) {
    const grosses = Math.floor(counts.demi_eau / 2);
    const reste = counts.demi_eau % 2;
    const v = grosses * RATIO.eau + reste * RATIO.demi_eau;
    total += v;
    if (grosses > 0) breakdown.push(`${counts.demi_eau} demi eau → ${grosses} eau${reste ? " + 1 demi" : ""} = ${v.toFixed(2)} pal`);
    else breakdown.push(`${reste} demi eau → ${v.toFixed(2)} pal`);
  }

  // Demi lait : 2 = 1 normale
  if (counts.demi_lait > 0) {
    const norm = Math.floor(counts.demi_lait / 2);
    const reste = counts.demi_lait % 2;
    const v = norm * RATIO.normale + reste * RATIO.demi_lait;
    total += v;
    if (norm > 0) breakdown.push(`${counts.demi_lait} demi lait → ${norm} normale${reste ? " + 1 demi" : ""} = ${v.toFixed(2)} pal`);
    else breakdown.push(`${reste} demi lait → ${v.toFixed(2)} pal`);
  }

  // Demi générique : 2 = 1 normale
  if (counts.demi > 0) {
    const norm = Math.floor(counts.demi / 2);
    const reste = counts.demi % 2;
    const v = norm * RATIO.normale + reste * RATIO.demi;
    total += v;
    if (norm > 0) breakdown.push(`${counts.demi} demi → ${norm} normale${reste ? " + 1 demi" : ""} = ${v.toFixed(2)} pal`);
    else breakdown.push(`${reste} demi → ${v.toFixed(2)} pal`);
  }

  // Palette normale
  if (counts.normale > 0) {
    const v = counts.normale * RATIO.normale;
    total += v;
    breakdown.push(`${counts.normale} normale = ${v.toFixed(2)} pal`);
  }

  // Palette eau : si une seule eau et rien d'autre → compte 1 (pas 1.5)
  if (counts.eau > 0) {
    const onlyOneEau = counts.eau === 1
      && counts.normale === 0 && counts.demi === 0
      && counts.demi_eau === 0 && counts.demi_lait === 0
      && counts.roll === 0;
    if (onlyOneEau) {
      total += 1;
      breakdown.push("1 palette eau (seule) = 1 pal");
    } else {
      const v = counts.eau * RATIO.eau;
      total += v;
      breakdown.push(`${counts.eau} palette eau = ${v.toFixed(2)} pal`);
    }
  }

  return { total: Math.round(total * 100) / 100, breakdown };
}

const PalletCalcPage = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<PalletEntry[]>([]);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [savedCalcs, setSavedCalcsState] = useState<SavedCalc[]>(getSavedCalcs());
  const [storeName, setStoreName] = useState("");
  const recognitionRef = useRef<any>(null);
  const entriesRef = useRef<PalletEntry[]>([]);
  const listeningRef = useRef(false);

  const updateEntries = (fn: (prev: PalletEntry[]) => PalletEntry[]) => {
    setEntries(prev => {
      const next = fn(prev);
      entriesRef.current = next;
      return next;
    });
  };

  const { total, breakdown } = smartTotal(entries);
  const excess = total > MAX_PALETTES ? Math.round((total - MAX_PALETTES) * 100) / 100 : 0;

  const speak = useCallback((text: string) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    speechSynthesis.speak(u);
  }, []);

  const addEntry = (type: EntryType, quantity: number) => {
    updateEntries(prev => [...prev, { type, quantity }]);
  };

  const removeEntry = (idx: number) => {
    updateEntries(prev => prev.filter((_, i) => i !== idx));
  };

  const handleVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast({ title: "Non supporté", variant: "destructive" }); return; }
    if (listening) {
      listeningRef.current = false;
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new SR();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let interimText = "";
      for (let i = 0; i < event.results.length; i++) {
        interimText += event.results[i][0].transcript + " ";
      }
      setTranscript(interimText.trim());

      const lastResult = event.results[event.results.length - 1];
      if (lastResult.isFinal) {
        const lower = lastResult[0].transcript.toLowerCase();

        if (lower.includes("résultat") || lower.includes("resultat") || lower.includes("total")) {
          const t = smartTotal(entriesRef.current).total;
          const msg = `Total: ${t} palettes${t > MAX_PALETTES ? `. Attention, dépassement de ${Math.round((t - MAX_PALETTES) * 100) / 100} palettes` : ""}`;
          speak(msg);
          return;
        }
        if (lower.includes("stop") || lower.includes("arrêt")) {
          listeningRef.current = false;
          recognitionRef.current?.stop();
          setListening(false);
          return;
        }

        const segments = lower.split(/(?:,|et\s|puis\s|ensuite\s|\bplus\b)/).map(s => s.trim()).filter(Boolean);
        const toProcess = segments.length > 0 ? segments : [lower];
        let added = 0;
        for (const seg of toProcess) {
          const numMatch = seg.match(/(\d+)/);
          if (!numMatch) continue;
          const qty = parseInt(numMatch[1]);
          let type: EntryType = "normale";
          if (seg.includes("roll") || seg.includes("rouleau")) type = "roll";
          else if (seg.includes("demi") && seg.includes("eau")) type = "demi_eau";
          else if (seg.includes("demi") && seg.includes("lait")) type = "demi_lait";
          else if (seg.includes("demi")) type = "demi";
          else if (seg.includes("eau")) type = "eau";
          addEntry(type, qty);
          added++;
        }
        if (added > 0) {
          try {
            speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance("ok");
            u.lang = "fr-FR"; u.rate = 1.4; u.volume = 0.6;
            speechSynthesis.speak(u);
          } catch {}
        }
      }
    };
    recognition.onerror = (e: any) => {
      if (e.error === "no-speech") return;
      listeningRef.current = false;
      setListening(false);
    };
    recognition.onend = () => {
      if (listeningRef.current) {
        try { recognition.start(); } catch { listeningRef.current = false; setListening(false); }
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = recognition;
    listeningRef.current = true;
    recognition.start();
    setListening(true);
  };

  useEffect(() => () => {
    listeningRef.current = false;
    recognitionRef.current?.stop();
  }, []);

  const handleSave = () => {
    const calc: SavedCalc = {
      id: crypto.randomUUID(),
      storeName: storeName.trim() || "Sans nom",
      entries: [...entries],
      total,
      date: new Date().toLocaleString("fr-FR"),
    };
    const updated = [calc, ...getSavedCalcs()];
    setSavedCalcs(updated);
    setSavedCalcsState(updated);
    toast({ title: `Calcul sauvegardé pour ${calc.storeName}` });
  };

  const handleDeleteCalc = (id: string) => {
    const updated = getSavedCalcs().filter(c => c.id !== id);
    setSavedCalcs(updated);
    setSavedCalcsState(updated);
    toast({ title: "Calcul supprimé" });
  };

  const [manualType, setManualType] = useState<EntryType>("normale");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualQty, setManualQty] = useState("");

  return (
    <div className="min-h-screen bg-black flex flex-col text-white">
      <TruckLogo />
      <div className="flex items-center gap-3 px-4 py-2">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-gray-800">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">Calculateur Palettes</h1>
      </div>

      <div className="flex-1 px-4 pb-4 space-y-3 overflow-y-auto">
        <input
          type="text"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          placeholder="Nom du magasin (optionnel)"
          className="w-full rounded-xl border border-gray-600 bg-gray-900 px-4 py-3 text-base text-white outline-none focus:ring-2 focus:ring-blue-500"
        />

        <button
          onClick={handleVoice}
          className={`w-full rounded-xl p-4 flex items-center justify-center gap-3 font-bold text-lg ${
            listening ? "bg-red-600 text-white animate-pulse" : "bg-green-600 text-white"
          }`}
        >
          {listening ? <MicOff size={24} /> : <Mic size={24} />}
          {listening ? "Arrêter (dites 'stop')" : "🎙️ Commande vocale"}
        </button>

        {listening && (
          <p className="text-xs text-center text-green-400 animate-pulse">🎙️ Parlez... dites "résultat" pour le total, "stop" pour arrêter</p>
        )}
        {transcript && (
          <p className="text-xs text-gray-400 bg-gray-900 rounded-lg p-2">{transcript}</p>
        )}

        <div className="bg-gray-900 border-2 border-gray-600 rounded-2xl p-4 space-y-3">
          <p className="text-base font-bold text-gray-300 text-center">Ajouter une palette</p>

          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="w-full rounded-xl border-2 border-gray-500 bg-gray-800 px-3 py-3 flex items-center gap-3 text-left"
          >
            <img src={IMAGES[manualType]} alt="" className="w-14 h-14 rounded-lg object-cover bg-white" />
            <span className="flex-1 text-xl font-bold text-white">{LABEL[manualType as EntryType]}</span>
            <ChevronDown size={28} className="text-gray-400" />
          </button>

          <div className="flex gap-2">
            <input
              type="number"
              value={manualQty}
              onChange={(e) => setManualQty(e.target.value)}
              placeholder="Qté"
              className="flex-1 rounded-xl border-2 border-gray-500 bg-gray-800 px-4 py-4 text-2xl font-black text-center text-white"
            />
            <button
              onClick={() => {
                if (manualQty) {
                  addEntry(manualType, parseInt(manualQty));
                  setManualQty("");
                }
              }}
              className="bg-blue-600 text-white rounded-xl px-8 py-4 text-2xl font-black"
            >
              +
            </button>
          </div>
        </div>

        {pickerOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4"
            onClick={() => setPickerOpen(false)}
          >
            <div
              className="bg-gray-900 border-2 border-gray-600 rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-700 sticky top-0 bg-gray-900">
                <span className="font-black text-lg text-white">Choisir une palette</span>
                <button onClick={() => setPickerOpen(false)} className="text-white">
                  <X size={28} />
                </button>
              </div>
              <div className="p-3 space-y-2">
                {(["roll","normale","eau","demi","demi_eau","demi_lait"] as EntryType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setManualType(t); setPickerOpen(false); }}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 ${
                      manualType === t ? "border-blue-500 bg-blue-900/30" : "border-gray-700 bg-gray-800"
                    }`}
                  >
                    <img src={IMAGES[t]} alt="" className="w-20 h-20 rounded-lg object-cover bg-white" />
                    <div className="flex-1 text-left">
                      <p className="text-lg font-bold text-white">{LABEL[t]}</p>
                      {t === "demi_lait" && <p className="text-xs text-gray-400">(lait)</p>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-1">
          {entries.map((e, i) => (
            <div key={i} className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
              <span className="text-sm">{e.quantity} × {LABEL[e.type]}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-gray-400">= {calcSingle(e).toFixed(2)} pal.</span>
                <button onClick={() => removeEntry(i)} className="text-red-500 p-1">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {entries.length > 0 && (
          <div className={`rounded-xl p-4 text-center space-y-2 ${
            excess > 0 ? "bg-red-900/30 border-2 border-red-500" : "bg-green-900/30 border-2 border-green-500"
          }`}>
            <div className="flex items-center justify-center gap-2">
              <Calculator size={20} />
              <span className="text-3xl font-black">{total}</span>
              <span className="text-sm text-gray-400">/ {MAX_PALETTES} palettes</span>
            </div>
            {breakdown.length > 0 && (
              <div className="text-xs text-gray-300 text-left bg-black/30 rounded-lg p-2 space-y-0.5">
                <p className="font-bold text-gray-400 mb-1">Regroupement :</p>
                {breakdown.map((b, i) => <p key={i}>• {b}</p>)}
              </div>
            )}
            {excess > 0 && (
              <p className="text-red-400 font-bold text-sm">
                ⚠️ Dépassement de {excess} palette(s) ! Enlevez {excess} palette(s).
              </p>
            )}
          </div>
        )}

        {entries.length > 0 && (
          <div className="flex gap-2">
            <button onClick={handleSave} className="flex-1 bg-blue-600 text-white rounded-xl py-3 font-bold flex items-center justify-center gap-2">
              <Save size={18} /> Sauvegarder
            </button>
            <button onClick={() => updateEntries(() => [])} className="bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 font-bold">
              Vider
            </button>
          </div>
        )}

        {savedCalcs.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-bold text-sm text-gray-400">Historique</h3>
            {savedCalcs.map((calc) => (
              <div key={calc.id} className="bg-gray-900 border border-gray-700 rounded-lg p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-sm">{calc.storeName}</p>
                    <p className="text-xs text-gray-400">{calc.date}</p>
                    <p className="text-sm font-bold text-green-400 mt-1">{calc.total} palettes</p>
                  </div>
                  <button onClick={() => handleDeleteCalc(calc.id)} className="text-red-500 p-1">
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PalletCalcPage;
