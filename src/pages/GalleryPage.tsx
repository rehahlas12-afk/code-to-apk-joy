import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, Trash2 } from "lucide-react";
import { getPlans, savePlan, deletePlan } from "@/lib/store";
import TruckLogo from "@/components/TruckLogo";
import { toast } from "@/hooks/use-toast";

const GalleryPage = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState(getPlans());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const now = new Date();
      savePlan({
        id: crypto.randomUUID(),
        imageData: ev.target?.result as string,
        stores: [],
        date: now.toLocaleDateString("fr-FR"),
        time: now.toLocaleTimeString("fr-FR"),
      });
      setPlans(getPlans());
      toast({ title: "Plan importé" });
    };
    reader.readAsDataURL(file);
  };

  const handleDelete = (id: string) => {
    deletePlan(id);
    setPlans(getPlans());
    toast({ title: "Plan supprimé" });
  };

  return (
    <div className="min-h-screen bg-black flex flex-col text-white">
      <TruckLogo />
      <div className="flex items-center gap-3 p-4">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-gray-800">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">Galerie</h1>
        <div className="flex-1" />
        <button onClick={() => fileInputRef.current?.click()} className="bg-primary text-primary-foreground rounded-lg px-4 py-2 flex items-center gap-2 text-sm font-bold">
          <Upload size={16} /> Importer
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      </div>

      <div className="p-4">
        {plans.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {plans.map((plan) => (
              <div key={plan.id} className="bg-card border rounded-xl overflow-hidden">
                <img
                  src={plan.imageData}
                  alt="Plan"
                  className="w-full aspect-square object-cover cursor-pointer"
                  onClick={() => navigate("/plan-viewer")}
                />
                <div className="p-2 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold">{plan.date}</p>
                    <p className="text-xs text-muted-foreground">{plan.time}</p>
                  </div>
                  <button onClick={() => handleDelete(plan.id)} className="p-1 text-destructive">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">Aucun plan dans la galerie</p>
        )}
      </div>
    </div>
  );
};

export default GalleryPage;
