import { useNavigate } from "react-router-dom";
import { Camera, Search, Eye, Plus, Calculator, Image, RotateCcw, LogOut } from "lucide-react";
import TruckLogo from "@/components/TruckLogo";
import { initDemoStores, getStores, setActivePlanId } from "@/lib/store";
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

  const handleReset = () => {
    localStorage.removeItem("staf_stores");
    setActivePlanId(null);
    initDemoStores();
    const count = getStores().length;
    toast({ title: "✅ Données réinitialisées", description: `${count} magasins de base rechargés` });
  };

  const handleQuit = () => {
    if (!confirm("Quitter l'application ?")) return;
    try {
      window.close();
    } catch {}
    // Fallback for PWA / browser: blank page
    window.location.href = "about:blank";
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
            onClick={handleReset}
            className="bg-gray-700 text-white rounded-xl p-6 flex flex-col items-center gap-3 shadow-lg active:scale-95 transition-transform"
          >
            <RotateCcw size={36} />
            <span className="text-base font-bold text-center leading-tight">Réinit. Données</span>
          </button>
        </div>

        <button
          onClick={handleQuit}
          className="mt-4 w-full bg-red-700 text-white rounded-xl p-5 flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-transform"
        >
          <LogOut size={28} />
          <span className="text-lg font-bold">Quitter l'application</span>
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
