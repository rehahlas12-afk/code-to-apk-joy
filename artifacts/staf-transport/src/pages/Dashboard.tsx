import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Search, Eye, Plus, Calculator, Image, LogOut, Download, Upload, CalendarClock, Key, X, Eye as EyeIcon, EyeOff, ExternalLink } from "lucide-react";
import TruckLogo from "@/components/TruckLogo";
import { getStoreNames, setStoreNames, type StoreName } from "@/lib/store";
import { quitApplication } from "@/lib/audioService";
import { toast } from "@/hooks/use-toast";

const AI_PROVIDERS = [
  {
    id: "gemini",
    name: "Gemini",
    company: "Google",
    emoji: "🤖",
    color: "border-blue-500",
    badge: "bg-blue-600",
    placeholder: "AIzaSy...",
    link: "https://aistudio.google.com/app/apikey",
    linkLabel: "aistudio.google.com",
    free: "Gratuit (tier quotidien)",
  },
  {
    id: "groq",
    name: "Groq / Meta Llama",
    company: "Groq Cloud (modèle Meta)",
    emoji: "⚡",
    color: "border-orange-500",
    badge: "bg-orange-600",
    placeholder: "gsk_...",
    link: "https://console.groq.com/keys",
    linkLabel: "console.groq.com",
    free: "Gratuit & très rapide (Llama 4)",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    company: "DeepSeek AI",
    emoji: "🔍",
    color: "border-cyan-500",
    badge: "bg-cyan-600",
    placeholder: "sk-...",
    link: "https://platform.deepseek.com/api_keys",
    linkLabel: "platform.deepseek.com",
    free: "Très économique (vision)",
  },
  {
    id: "openai",
    name: "OpenAI / Microsoft",
    company: "OpenAI",
    emoji: "🧠",
    color: "border-green-500",
    badge: "bg-green-600",
    placeholder: "sk-...",
    link: "https://platform.openai.com/api-keys",
    linkLabel: "platform.openai.com",
    free: "Payant (GPT-4o)",
  },
];

const NAV_BUTTONS = [
  { label: "Scanner Plan", icon: Camera, path: "/camera", color: "bg-blue-600" },
  { label: "Galerie", icon: Image, path: "/gallery", color: "bg-green-700" },
  { label: "Recherche", icon: Search, path: "/search", color: "bg-orange-600" },
  { label: "Visualiser Plan", icon: Eye, path: "/plan-viewer", color: "bg-blue-700" },
  { label: "Noms Magasins", icon: Plus, path: "/store-names", color: "bg-orange-700" },
  { label: "Calculateur Palettes", icon: Calculator, path: "/pallet-calc", color: "bg-green-700" },
];

function getActiveProvider(): string {
  return localStorage.getItem("aiProvider") || "gemini";
}

function hasAnyKey(): boolean {
  return AI_PROVIDERS.some(p => !!localStorage.getItem(`aiKey_${p.id}`));
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keys, setKeys] = useState<Record<string, string>>(() =>
    Object.fromEntries(AI_PROVIDERS.map(p => [p.id, localStorage.getItem(`aiKey_${p.id}`) ?? ""]))
  );
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [activeProvider, setActiveProvider] = useState(getActiveProvider);
  const [anyKey, setAnyKey] = useState(hasAnyKey);

  const handleSaveKeys = () => {
    AI_PROVIDERS.forEach(p => {
      const trimmed = keys[p.id].trim();
      if (trimmed) localStorage.setItem(`aiKey_${p.id}`, trimmed);
      else localStorage.removeItem(`aiKey_${p.id}`);
    });
    localStorage.setItem("aiProvider", activeProvider);
    setAnyKey(hasAnyKey());
    toast({ title: "✅ Clés IA sauvegardées", description: `Fournisseur actif : ${AI_PROVIDERS.find(p => p.id === activeProvider)?.name}` });
    setShowKeyModal(false);
  };

  const handleQuit = async () => {
    const ok = window.confirm("Voulez-vous quitter l'application ?");
    if (!ok) return;
    await quitApplication();
  };

  const handleExportNames = () => {
    const names = getStoreNames();
    if (names.length === 0) { toast({ title: "Aucun nom à exporter" }); return; }
    const blob = new Blob([JSON.stringify(names, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `staf-noms-magasins-${new Date().toISOString().slice(0, 10)}.json`;
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
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data)) throw new Error();
        const valid = data.filter((n: any) => n?.number && n?.name) as StoreName[];
        const existing = getStoreNames();
        const map = new Map(existing.map(n => [n.number, n.name]));
        valid.forEach(n => map.set(String(n.number), String(n.name)));
        const merged = Array.from(map.entries()).map(([number, name]) => ({ number, name }));
        setStoreNames(merged);
        toast({ title: `✅ ${valid.length} noms importés`, description: `Total: ${merged.length}` });
      } catch {
        toast({ title: "❌ Erreur import", description: "Fichier invalide", variant: "destructive" });
      }
    };
    input.click();
  };

  const activeProv = AI_PROVIDERS.find(p => p.id === activeProvider);

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <TruckLogo />
      <div className="flex-1 p-4">
        <div className="grid grid-cols-2 gap-3">
          {NAV_BUTTONS.map((btn) => (
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

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button onClick={handleExportNames} className="bg-purple-700 text-white rounded-xl p-4 flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
            <Download size={22} /><span className="text-sm font-bold">Sauvegarder noms</span>
          </button>
          <button onClick={handleImportNames} className="bg-purple-600 text-white rounded-xl p-4 flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
            <Upload size={22} /><span className="text-sm font-bold">Restaurer noms</span>
          </button>
        </div>

        <div className="mt-3">
          <button
            onClick={() => setShowKeyModal(true)}
            className={`w-full rounded-xl p-4 flex items-center justify-between gap-2 shadow-lg active:scale-95 transition-transform ${anyKey ? "bg-yellow-700" : "bg-gray-700"}`}
          >
            <div className="flex items-center gap-2">
              <Key size={22} />
              <div className="text-left">
                <p className="text-sm font-bold text-white">Clés IA personnelles</p>
                {anyKey && <p className="text-xs text-yellow-200">{activeProv?.emoji} {activeProv?.name} actif</p>}
              </div>
            </div>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${anyKey ? "bg-yellow-400 text-black" : "bg-gray-500 text-white"}`}>
              {anyKey ? "Configurée ✓" : "Non configurée"}
            </span>
          </button>
        </div>
      </div>

      {showKeyModal && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <h2 className="text-base font-bold text-white flex items-center gap-2"><Key size={18}/> Clés API – Intelligence Artificielle</h2>
            <button onClick={() => setShowKeyModal(false)} className="text-gray-400 p-1"><X size={22}/></button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            <p className="text-xs text-gray-400">Quand le quota d'un fournisseur est épuisé, active un autre. Sélectionne le fournisseur actif avec le bouton radio.</p>

            {AI_PROVIDERS.map(p => {
              const isActive = activeProvider === p.id;
              const hasKey = !!keys[p.id];
              return (
                <div key={p.id} className={`rounded-xl border-2 p-4 space-y-3 ${isActive ? p.color : "border-gray-700"} bg-gray-900`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{p.emoji}</span>
                      <div>
                        <p className="text-sm font-bold text-white">{p.name}</p>
                        <p className="text-xs text-gray-400">{p.free}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveProvider(p.id)}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${isActive ? `${p.badge} text-white` : "bg-gray-700 text-gray-400"}`}
                    >
                      {isActive ? "✓ Actif" : "Activer"}
                    </button>
                  </div>

                  <a
                    href={p.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-400 text-xs underline"
                  >
                    <ExternalLink size={12}/> Obtenir une clé : {p.linkLabel}
                  </a>

                  <div className="relative">
                    <input
                      type={showKey[p.id] ? "text" : "password"}
                      value={keys[p.id]}
                      onChange={e => setKeys(prev => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder={hasKey ? "••••••••••••••••" : p.placeholder}
                      className={`w-full bg-gray-800 border rounded-xl px-3 py-2.5 text-white text-sm outline-none pr-10 ${hasKey ? "border-green-600" : "border-gray-600"}`}
                    />
                    <button
                      onClick={() => setShowKey(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    >
                      {showKey[p.id] ? <EyeOff size={16}/> : <EyeIcon size={16}/>}
                    </button>
                  </div>

                  {hasKey && (
                    <button
                      onClick={() => setKeys(prev => ({ ...prev, [p.id]: "" }))}
                      className="text-xs text-red-400 underline"
                    >
                      Supprimer la clé
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="px-4 py-3 border-t border-gray-800">
            <button
              onClick={handleSaveKeys}
              className="w-full bg-yellow-500 text-black rounded-xl py-3 font-bold text-base"
            >
              💾 Sauvegarder
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
