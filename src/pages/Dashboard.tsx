import { useNavigate } from "react-router-dom";
import { Camera, Search, Eye, Plus, Calculator, Image, LogOut, Download, Upload, CalendarClock } from "lucide-react";
import TruckLogo from "@/components/TruckLogo";
import { getStoreNames, setStoreNames, type StoreName } from "@/lib/store";
import { quitApplication } from "@/lib/audioService";
import { toast } from "@/hooks/use-toast";

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
      </div>
    </div>
  );
};

export default Dashboard;
