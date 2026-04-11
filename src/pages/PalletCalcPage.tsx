import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mic, MicOff, Calculator, Trash2, Save } from "lucide-react";
import TruckLogo from "@/components/TruckLogo";
import { toast } from "@/hooks/use-toast";

interface PalletEntry {
  type: "roll" | "demi" | "normal" | "gros" | "demi_eau" | "demi_lait" | "gros_eau";
  quantity: number;
}

const MAX_PALETTES = 20.5;

const PalletCalcPage = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<PalletEntry[]>([]);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [savedCalcs, setSavedCalcs] = useState<{ entries: PalletEntry[]; total: number; date: string }[]>([]);
  const recognitionRef = useRef<any>(null);
  const entriesRef = useRef<PalletEntry[]>([]);

  // Keep ref in sync
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
        case "roll":
          total += e.quantity * 0.64;
          break;
        case "demi":
        case "demi_eau":
        case "demi_lait":
          total += e.quantity * 0.5;
          break;
        case "normal":
        case "gros":
        case "gros_eau":
          total += e.quantity;
          break;
      }
    });
    return Math.round(total * 100) / 100;
  }, []);

  const total = calcPalettes(entries);
  const excess = total > MAX_PALETTES ? Math.round((total - MAX_PALETTES) * 100) / 100 : 0;

  const speak = useCallback((text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "fr-FR";
    speechSynthesis.speak(utterance);
  }, []);

  const addEntry = (type: PalletEntry["type"], quantity: number) => {
    updateEntries(prev => [...prev, { type, quantity }]);
  };

  const removeEntry = (idx: number) => {
    updateEntries(prev => prev.filter((_, i) => i !== idx));
  };

  const handleVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "Non supporté", variant: "destructive" });
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      // Show interim results
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
          const msg = `Total: ${t} palettes${t > MAX_PALETTES ? `. Attention, vous dépassez de ${Math.round((t - MAX_PALETTES) * 100) / 100} palettes` : ""}`;
          speak(msg);
          return;
        }

        if (lower.includes("stop") || lower.includes("arrêt")) {
          recognitionRef.current?.stop();
          setListening(false);
          return;
        }

        // Parse quantities - look for number + type
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
      if (e.error === "no-speech") {
        // Don't stop on no-speech, let it continue listening
        return;
      }
      setListening(false);
    };

    // Auto-restart on end to keep listening longer
    recognition.onend = () => {
      if (listening && recognitionRef.current) {
        try {
          recognition.start();
        } catch {
          setListening(false);
        }
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const handleSave = () => {
    setSavedCalcs(prev => [...prev, { entries: [...entries], total, date: new Date().toLocaleString("fr-FR") }]);
    toast({ title: "Calcul sauvegardé" });
  };

  const [manualType, setManualType] = useState<PalletEntry["type"]>("normal");
  const [manualQty, setManualQty] = useState("");

  return (
    <div className="min-h-screen bg-black flex flex-col text-white">
      <TruckLogo />
      <div className="flex items-center gap-3 p-4">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-muted">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">Calculateur Palettes</h1>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        <button
          onClick={handleVoice}
          className={`w-full rounded-xl p-4 flex items-center justify-center gap-3 font-bold text-lg ${
            listening ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-accent text-accent-foreground"
          }`}
        >
          {listening ? <MicOff size={24} /> : <Mic size={24} />}
          {listening ? "Arrêter (dites 'stop')" : "Commande vocale"}
        </button>

        {listening && (
          <p className="text-xs text-center text-green-400 animate-pulse">🎙️ En écoute... Parlez maintenant. Dites "résultat" pour le total.</p>
        )}

        {transcript && (
          <p className="text-xs text-muted-foreground bg-muted/20 rounded-lg p-2">{transcript}</p>
        )}

        <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 space-y-2">
          <div className="flex gap-2">
            <select
              value={manualType}
              onChange={(e) => setManualType(e.target.value as PalletEntry["type"])}
              className="flex-1 rounded-lg border border-gray-600 bg-gray-800 px-2 py-2 text-sm text-white"
            >
              <option value="roll">Rôle</option>
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
              className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-bold"
            >
              +
            </button>
          </div>
        </div>

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

        {entries.length > 0 && (
          <div className="flex gap-2">
            <button onClick={handleSave} className="flex-1 bg-primary text-primary-foreground rounded-xl py-3 font-bold flex items-center justify-center gap-2">
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
            {savedCalcs.map((calc, i) => (
              <div key={i} className="bg-gray-900 border border-gray-700 rounded-lg p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">{calc.date}</span>
                  <span className="font-bold">{calc.total} palettes</span>
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
    roll: "Rôle",
    demi: "Demi palette",
    demi_eau: "Demi eau",
    demi_lait: "Demi lait",
    normal: "Palette normale",
    gros: "Grosse palette",
    gros_eau: "Grosse palette eau",
  };
  return labels[type] || type;
}

function calcSingle(e: PalletEntry): number {
  switch (e.type) {
    case "roll": return e.quantity * 0.64;
    case "demi":
    case "demi_eau":
    case "demi_lait": return e.quantity * 0.5;
    default: return e.quantity;
  }
}

export default PalletCalcPage;
