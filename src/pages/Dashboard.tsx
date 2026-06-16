import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Search, Eye, Plus, Calculator, Image, LogOut, Download, Upload, CalendarClock, Menu, X, Share2, FileText } from "lucide-react";
import TruckLogo from "@/components/TruckLogo";
import { getStoreNames, setStoreNames, type StoreName } from "@/lib/store";
import { quitApplication } from "@/lib/appExit";
import { toast } from "@/hooks/use-toast";
import { sharePlanActive, sharePlanAsPDF, getOpenCount } from "@/lib/shareUtils";

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
  const [menuOpen, setMenuOpen] = useState(false);

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

  const menuItems = [
    ...buttons,
    { label: "Pointage nom prénom", icon: CalendarClock, path: "/time-tracking", color: "bg-gray-700" },
  ];

  const openCount = getOpenCount();
  const handleShare = async () => {
    const r = await sharePlanActive();
    toast({ title: r.ok ? "✅ " + r.message : "⚠️ " + r.message, variant: r.ok ? "default" : "destructive" });
  };
  const handleSharePDF = async () => {
    toast({ title: "📄 Préparation du PDF…" });
    const r = await sharePlanAsPDF();
    toast({ title: r.ok ? "✅ " + r.message : "⚠️ " + r.message, variant: r.ok ? "default" : "destructive" });
  };

  const go = (path: string) => { setMenuOpen(false); navigate(path); };

  return (
    <div className="min-h-screen bg-black flex flex-col relative">
      <TruckLogo />

      {/* Bouton menu hamburger en haut à gauche (blanc sur noir) */}
      <button
        onClick={() => setMenuOpen(true)}
        aria-label="Ouvrir le menu"
        className="absolute top-3 left-3 z-30 bg-black text-white border-2 border-white rounded-xl p-3 shadow-lg active:scale-95"
      >
        <Menu size={28} strokeWidth={3} />
      </button>

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
            onClick={handleExportNames}
            className="bg-purple-700 text-white rounded-xl p-6 flex flex-col items-center gap-3 shadow-lg active:scale-95 transition-transform"
          >
            <Download size={36} />
            <span className="text-base font-bold text-center leading-tight">Sauvegarder noms</span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={handleImportNames}
            className="bg-purple-600 text-white rounded-xl p-4 flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform"
          >
            <Upload size={22} />
            <span className="text-sm font-bold">Restaurer noms</span>
          </button>
          <button
            onClick={handleQuit}
            className="bg-red-700 text-white rounded-xl p-4 flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform"
          >
            <LogOut size={22} />
            <span className="text-sm font-bold">Quitter l'app</span>
          </button>
        </div>

        {/* Bouton de partage du plan (WhatsApp / SMS / Email…) */}
        <button
          onClick={handleShare}
          className="mt-4 w-full bg-green-600 text-white rounded-xl p-4 flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform"
        >
          <Share2 size={24} />
          <span className="text-base font-black">Partager le plan (WhatsApp…)</span>
        </button>

        <p className="mt-3 text-center text-xs text-gray-500">
          App ouverte {openCount} fois sur ce téléphone
        </p>
      </div>

      {/* Menu latéral droit (noir & blanc) */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="absolute top-0 left-0 h-full w-72 bg-black text-white flex flex-col shadow-2xl animate-in slide-in-from-left border-r-2 border-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b-2 border-white">
              <span className="font-black text-lg">MENU</span>
              <button onClick={() => setMenuOpen(false)} aria-label="Fermer">
                <X size={28} strokeWidth={3} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {menuItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => go(item.path)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border-2 border-white bg-black text-white active:bg-gray-800"
                >
                  <item.icon size={24} strokeWidth={2.5} />
                  <span className="font-bold text-base">{item.label}</span>
                </button>
              ))}
              <button
                onClick={() => { setMenuOpen(false); handleExportNames(); }}
                className="w-full flex items-center gap-3 p-3 rounded-lg border-2 border-white bg-black text-white active:bg-gray-800"
              >
                <Download size={24} strokeWidth={2.5} />
                <span className="font-bold text-base">Sauvegarder noms</span>
              </button>
              <button
                onClick={() => { setMenuOpen(false); handleImportNames(); }}
                className="w-full flex items-center gap-3 p-3 rounded-lg border-2 border-white bg-black text-white active:bg-gray-800"
              >
                <Upload size={24} strokeWidth={2.5} />
                <span className="font-bold text-base">Restaurer noms</span>
              </button>
            </div>
            <div className="p-3 border-t-2 border-white">
              <button
                onClick={() => { setMenuOpen(false); handleQuit(); }}
                className="w-full flex items-center justify-center gap-3 p-4 rounded-lg bg-white text-black active:bg-gray-300"
              >
                <LogOut size={24} strokeWidth={2.5} />
                <span className="font-black text-lg">Quitter l'app</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
