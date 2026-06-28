import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Search, Eye, Plus, Calculator, Image, LogOut, Download, Upload, CalendarClock, Key, X, Eye as EyeIcon, EyeOff } from "lucide-react";
import TruckLogo from "@/components/TruckLogo";
import { getStoreNames, setStoreNames, type StoreName } from "@/lib/store";
import { quitApplication } from "@/lib/audioService";
import { toast } from "@/hooks/use-toast";

const GEMINI_KEY_LS = "userGeminiApiKey";

const buttons = [
  { label: "Scanner Plan", icon: Camera, path: "/camera", color: "bg-blue-600" },
  { label: "Galerie", icon: Image, path: "/gallery", color: "bg-green-700" },
  { label: "Recherche", icon: Search, path: "/search", color: "bg-orange-600" },
  { label: "Visualiser Plan", icon: Eye, path: "/plan-viewer", color: "bg-blue-700" },
  { label: "Noms Magasins", icon: Plus, path: "/store-names", color: "bg-orange-700" },
  { label: "Calculateur Palettes", icon: Calculator, path: "/pallet-calc", color: "bg-green-700" },
];

const Dashboard = () => {
  const navigate = useNavigate();
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInput, setKeyInput] = useState(() => localStorage.getItem(GEMINI_KEY_LS) ?? "");
  const [showKey, setShowKey] = useState(false);

  const savedKey = localStorage.getItem(GEMINI_KEY_LS);

  const handleSaveKey = () => {
    const trimmed = keyInput.trim();
    if (trimmed) {
      localStorage.setItem(GEMINI_KEY_LS, trimmed);
      toast({ title: "✅ Clé API Gemini sauvegardée", description: "Cette clé sera utilisée pour l'analyse des plans." });
    } else {
      localStorage.removeItem(GEMINI_KEY_LS);
      toast({ title: "🗑️ Clé API supprimée", description: "La clé Replit sera utilisée par défaut." });
    }
    setShowKeyModal(false);
  };

  const handleQuit = async () => {
    const ok = window.confirm("Voulez-vous quitter l'application ?");
    if (!ok) return;
    await quitApplication();
  };

  const handleExportNames = () => {
    const names = getStoreNames();
    if (names.length === 0) {
      toast({ title: "Aucun nom à exporter" });
      return;
    }
    const data = JSON.stringify(names, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `staf-noms-magasins-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `✅ ${names.length} noms exportés` });
  };

  const handleImportNames = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json,.txt";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error("Format invalide");
        const valid = data.filter((n: any) => n && n.number && n.name) as StoreName[];
        // Merge with existing
        const existing = getStoreNames();
        const map = new Map(existing.map(n => [n.number, n.name]));
        valid.forEach(n => map.set(String(n.number), String(n.name)));
        const merged = Array.from(map.entries()).map(([number, name]) => ({ number, name }));
        setStoreNames(merged);
        toast({ title: `✅ ${valid.length} noms importés`, description: `Total: ${merged.length}` });
      } catch (err) {
        toast({ title: "❌ Erreur import", description: "Fichier invalide", variant: "destructive" });
      }
    };
    input.click();
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <TruckLogo />
      <div className="flex-1 p-4">
        <div className="grid grid-cols-2 gap-3">
          {buttons.map((btn) => (
            <button
              key={btn.path}
              onClick={() => navigate(btn.path)}
              className={`${btn.color} text-white rounded-xl p-6 flex flex-col items-center gap-3 shadow-lg active:scale-95 transition-transform`}
            >
              <btn.icon size={36} />
              <span className="text-base font-bold text-center leading-tight">{btn.label}</span>
            </button>
          ))}
          <button
            onClick={() => navigate("/time-tracking")}
            className="bg-gray-700 text-white rounded-xl p-6 flex flex-col items-center gap-3 shadow-lg active:scale-95 transition-transform"
          >
            <CalendarClock size={36} />
            <span className="text-base font-bold text-center leading-tight">Pointage nom prénom</span>
          </button>
          <button
            onClick={handleQuit}
            className="bg-red-700 text-white rounded-xl p-6 flex flex-col items-center gap-3 shadow-lg active:scale-95 transition-transform"
          >
            <LogOut size={36} />
            <span className="text-base font-bold text-center leading-tight">Quitter l'app</span>
          </button>
        </div>

        {/* Sauvegarde / restauration des noms magasins */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={handleExportNames}
            className="bg-purple-700 text-white rounded-xl p-4 flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform"
          >
            <Download size={22} />
            <span className="text-sm font-bold">Sauvegarder noms</span>
          </button>
          <button
            onClick={handleImportNames}
            className="bg-purple-600 text-white rounded-xl p-4 flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform"
          >
            <Upload size={22} />
            <span className="text-sm font-bold">Restaurer noms</span>
          </button>
        </div>

        {/* Clé API Gemini */}
        <div className="mt-3">
          <button
            onClick={() => { setKeyInput(localStorage.getItem(GEMINI_KEY_LS) ?? ""); setShowKeyModal(true); }}
            className={`w-full rounded-xl p-4 flex items-center justify-between gap-2 shadow-lg active:scale-95 transition-transform ${savedKey ? "bg-yellow-700" : "bg-gray-700"}`}
          >
            <div className="flex items-center gap-2">
              <Key size={22} />
              <span className="text-sm font-bold text-white">Clé API Gemini personnelle</span>
            </div>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${savedKey ? "bg-yellow-500 text-black" : "bg-gray-500 text-white"}`}>
              {savedKey ? "Active ✓" : "Non configurée"}
            </span>
          </button>
        </div>
      </div>

      {/* Modal saisie clé API */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><Key size={20}/> Clé API Gemini</h2>
              <button onClick={() => setShowKeyModal(false)} className="text-gray-400 p-1"><X size={20}/></button>
            </div>

            <div className="text-sm text-gray-300 space-y-1">
              <p>Quand le quota Replit est épuisé, utilise ta clé Gemini personnelle.</p>
              <p className="text-gray-400 text-xs">Obtenir une clé gratuite : <span className="text-blue-400">aistudio.google.com</span></p>
            </div>

            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-yellow-500 pr-10"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showKey ? <EyeOff size={18}/> : <EyeIcon size={18}/>}
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { setKeyInput(""); }}
                className="flex-1 bg-red-900 text-red-300 rounded-xl py-3 text-sm font-bold"
              >
                Supprimer
              </button>
              <button
                onClick={handleSaveKey}
                className="flex-1 bg-yellow-600 text-black rounded-xl py-3 text-sm font-bold"
              >
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
