import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mic, MicOff, Calculator, Trash2, Save, X } from "lucide-react";
import TruckLogo from "@/components/TruckLogo";
import { toast } from "@/hooks/use-toast";

interface PalletEntry {
  type: "roll" | "demi" | "normal" | "gros" | "demi_eau" | "demi_lait" | "gros_eau";
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

function getSavedCalcs(): SavedCalc[] {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); } catch { return []; }
}

function setSavedCalcs(calcs: SavedCalc[]) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(calcs));
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

  const calcPalettes = useCallback((list: PalletEntry[]) => {
    let total = 0;
    list.forEach(e => {
      switch (e.type) {
        case "roll": total += e.quantity * 0.64; break;
        case "demi": case "demi_eau": case "demi_lait": total += e.quantity * 0.5; break;
        default: total += e.quantity; break;
      }
    });
    return Math.round(total * 100) / 100;
  }, []);

  const total = calcPalettes(entries);
  const excess = total > MAX_PALETTES ? Math.round((total - MAX_PALETTES) * 100) / 100 : 0;

  const speak = useCallback((text: string) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    speechSynthesis.speak(u);
  }, []);

  const addEntry = (type: PalletEntry["type"], quantity: number) => {
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
          const t = calcPalettes(entriesRef.current);
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

        const numMatch = lower.match(/(\d+)/);
        if (numMatch) {
          const qty = parseInt(numMatch[1]);
          let type: PalletEntry["type"] = "normal";
          if (lower.includes("roll") || lower.includes("rôle") || lower.includes("role") || lower.includes("rouleau")) type = "roll";
          else if (lower.includes("demi") && lower.includes("eau")) type = "demi_eau";
          else if (lower.includes("demi") && lower.includes("lait")) type = "demi_lait";
          else if (lower.includes("demi")) type = "demi";
          else if (lower.includes("gros") && lower.includes("eau")) type = "gros_eau";
          else if (lower.includes("gros") || lower.includes("grosse")) type = "gros";

          addEntry(type, qty);
          speak(`${qty} ${typeLabel(type)} ajoutés`);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      listeningRef.current = false;
      recognitionRef.current?.stop();
    };
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

  const [manualType, setManualType] = useState<PalletEntry["type"]>("normal");
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
        {/* Store name */}
        <input
          type="text"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          placeholder="Nom du magasin (optionnel)"
          className="w-full rounded-xl border border-gray-600 bg-gray-900 px-4 py-3 text-base text-white outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Voice button */}
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

        {/* Manual entry */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 space-y-2">
          <div className="flex gap-2">
            <select
              value={manualType}
              onChange={(e) => setManualType(e.target.value as PalletEntry["type"])}
              className="flex-1 rounded-lg border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-white"
            >
              <option value="roll">Roll</option>
              <option value="demi">Demi palette</option>
              <option value="demi_eau">Demi eau</option>
              <option value="demi_lait">Demi lait</option>
              <option value="normal">Palette normale</option>
              <option value="gros">Grosse palette</option>
              <option value="gros_eau">Grosse palette eau</option>
            </select>
            <input
              type="number"
              value={manualQty}
              onChange={(e) => setManualQty(e.target.value)}
              placeholder="Qté"
              className="w-20 rounded-lg border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-center text-white"
            />
            <button
              onClick={() => {
                if (manualQty) {
                  addEntry(manualType, parseInt(manualQty));
                  setManualQty("");
                }
              }}
              className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-bold"
            >
              +
            </button>
          </div>
        </div>

        {/* Entries list */}
        <div className="space-y-1">
          {entries.map((e, i) => (
            <div key={i} className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
              <span className="text-sm">{e.quantity} × {typeLabel(e.type)}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-gray-400">
                  = {calcSingle(e).toFixed(2)} pal.
                </span>
                <button onClick={() => removeEntry(i)} className="text-red-500 p-1">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        {entries.length > 0 && (
          <div className={`rounded-xl p-4 text-center space-y-2 ${
            excess > 0 ? "bg-red-900/30 border-2 border-red-500" : "bg-green-900/30 border-2 border-green-500"
          }`}>
            <div className="flex items-center justify-center gap-2">
              <Calculator size={20} />
              <span className="text-2xl font-black">{total}</span>
              <span className="text-sm text-gray-400">/ {MAX_PALETTES} palettes</span>
            </div>
            {excess > 0 && (
              <p className="text-red-400 font-bold text-sm">
                ⚠️ Dépassement de {excess} palette(s) ! Enlevez {excess} palette(s).
              </p>
            )}
          </div>
        )}

        {/* Actions */}
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

        {/* Saved history */}
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

function typeLabel(type: PalletEntry["type"]): string {
  const labels: Record<string, string> = {
    roll: "Roll", demi: "Demi palette", demi_eau: "Demi eau", demi_lait: "Demi lait",
    normal: "Palette normale", gros: "Grosse palette", gros_eau: "Grosse palette eau",
  };
  return labels[type] || type;
}

function calcSingle(e: PalletEntry): number {
  switch (e.type) {
    case "roll": return e.quantity * 0.64;
    case "demi": case "demi_eau": case "demi_lait": return e.quantity * 0.5;
    default: return e.quantity;
  }
}

export default PalletCalcPage;
