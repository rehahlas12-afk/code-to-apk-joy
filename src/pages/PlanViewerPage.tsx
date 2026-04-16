import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Trash2, Check } from "lucide-react";
import { activatePlan, deletePlan, getActivePlan, getPlans } from "@/lib/store";
import TruckLogo from "@/components/TruckLogo";
import { toast } from "@/hooks/use-toast";

const PlanViewerPage = () => {
  const navigate = useNavigate();
  const initialPlans = getPlans();
  const [plans, setPlans] = useState(initialPlans);
  const [selectedPlan, setSelectedPlan] = useState(getActivePlan() || initialPlans[0] || null);
  const imgRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const lastDistRef = useRef<number | null>(null);

  useEffect(() => {
    if (!selectedPlan) return;

    const activePlan = getActivePlan();
    if (activePlan?.id === selectedPlan.id) return;

    activatePlan(selectedPlan.id);
  }, [selectedPlan]);

  const selectPlan = (plan: typeof selectedPlan) => {
    if (!plan) return;

    const activePlan = activatePlan(plan.id) ?? plan;
    setSelectedPlan(plan);
    setScale(1);

    toast({
      title: "Plan actif",
      description: activePlan.stores.length > 0
        ? `${activePlan.stores.length} magasins chargés`
        : "Ce plan est bien sélectionné, mais aucun magasin n'a encore été détecté.",
    });
  };

  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (lastDistRef.current !== null) {
          const delta = dist / lastDistRef.current;
          setScale(s => Math.min(5, Math.max(0.5, s * delta)));
        }
        lastDistRef.current = dist;
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = el.getBoundingClientRect();
        setOrigin({ x: cx - rect.left, y: cy - rect.top });
      }
    };

    const onTouchEnd = () => { lastDistRef.current = null; };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const handleDelete = (id: string) => {
    deletePlan(id);
    const updated = getPlans();
    setPlans(updated);
    setSelectedPlan(getActivePlan() || updated[0] || null);
    toast({ title: "Plan supprimé" });
  };

  return (
    <div className="min-h-screen bg-black flex flex-col text-white">
      <TruckLogo />
      <div className="flex items-center gap-3 px-4 py-2">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-gray-800">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">Visualiser Plan</h1>
      </div>

      {/* Plan thumbnails for selection */}
      {plans.length > 1 && (
        <div className="px-4 pb-2">
          <p className="text-xs text-gray-400 mb-2">Sélectionnez un plan :</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {plans.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPlan(p)}
                className={`shrink-0 rounded-lg border-2 overflow-hidden w-20 h-20 relative ${
                  selectedPlan?.id === p.id ? "border-green-500" : "border-gray-700"
                }`}
              >
                <img src={p.imageData} alt="" className="w-full h-full object-cover" />
                {selectedPlan?.id === p.id && (
                  <div className="absolute top-1 right-1 bg-green-500 rounded-full p-0.5">
                    <Check size={10} />
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-center py-0.5">
                  {p.date}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedPlan ? (
        <div className="flex-1 px-4 pb-3 flex flex-col gap-2 min-h-0">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              {selectedPlan.date} à {selectedPlan.time} • {selectedPlan.stores.length} magasins
            </p>
            <button onClick={() => handleDelete(selectedPlan.id)} className="p-2 text-red-500">
              <Trash2 size={18} />
            </button>
          </div>

          <div
            ref={imgRef}
            className="flex-1 overflow-hidden rounded-xl border border-gray-700 bg-gray-900 min-h-0"
            style={{ touchAction: "manipulation" }}
          >
            <img
              src={selectedPlan.imageData}
              alt="Plan"
              className="w-full h-full object-contain transition-transform"
              style={{
                transform: `scale(${scale})`,
                transformOrigin: `${origin.x}px ${origin.y}px`,
              }}
            />
          </div>

          <p className="text-xs text-center text-gray-500">Pincez pour zoomer</p>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-gray-500 text-center">Aucun plan sauvegardé.<br />Scannez ou importez un plan.</p>
        </div>
      )}
    </div>
  );
};

export default PlanViewerPage;
