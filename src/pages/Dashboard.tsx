import { useNavigate } from "react-router-dom";
import { Camera, Mic, Search, Eye, Plus, Calculator, Image } from "lucide-react";
import TruckLogo from "@/components/TruckLogo";

const buttons = [
  { label: "Scanner Plan", icon: Camera, path: "/camera", color: "bg-primary" },
  { label: "Recherche Vocale", icon: Mic, path: "/voice-search", color: "bg-accent" },
  { label: "Recherche Clavier", icon: Search, path: "/text-search", color: "bg-secondary" },
  { label: "Visualiser Plan", icon: Eye, path: "/plan-viewer", color: "bg-primary" },
  { label: "Noms Magasins", icon: Plus, path: "/store-names", color: "bg-accent" },
  { label: "Calculateur Palettes", icon: Calculator, path: "/pallet-calc", color: "bg-secondary" },
  { label: "Galerie", icon: Image, path: "/gallery", color: "bg-primary" },
];

const Dashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TruckLogo />
      <div className="flex-1 p-4">
        <div className="grid grid-cols-2 gap-3">
          {buttons.map((btn) => (
            <button
              key={btn.path}
              onClick={() => navigate(btn.path)}
              className={`${btn.color} text-primary-foreground rounded-xl p-5 flex flex-col items-center gap-3 shadow-lg active:scale-95 transition-transform`}
            >
              <btn.icon size={32} />
              <span className="text-sm font-bold text-center leading-tight">{btn.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
