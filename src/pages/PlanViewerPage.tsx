import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { getPlans, deletePlan } from "@/lib/store";
import TruckLogo from "@/components/TruckLogo";
import { toast } from "@/hooks/use-toast";

const PlanViewerPage = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState(getPlans());
  const [selectedPlan, setSelectedPlan] = useState(plans[0] || null);
  const imgRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const lastDistRef = useRef<number | null>(null);

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
    setSelectedPlan(updated[0] || null);
    toast({ title: "Plan supprimé" });
  };

  return (
    <div className="min-h-screen bg-black flex flex-col text-white">
      <TruckLogo />
      <div className="flex items-center gap-3 p-4">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-gray-800">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">Visualiser Plan</h1>
      </div>

      {selectedPlan ? (
        <div className="flex-1 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {selectedPlan.date} à {selectedPlan.time}
            </p>
            <button onClick={() => handleDelete(selectedPlan.id)} className="p-2 text-destructive">
              <Trash2 size={18} />
            </button>
          </div>

          <div
            ref={imgRef}
            className="flex-1 overflow-hidden rounded-xl border bg-card touch-action-manipulation"
          >
            <img
              src={selectedPlan.imageData}
              alt="Plan"
              className="w-full transition-transform"
              style={{
                transform: `scale(${scale})`,
                transformOrigin: `${origin.x}px ${origin.y}px`,
              }}
            />
          </div>

          <p className="text-xs text-center text-muted-foreground">Pincez pour zoomer</p>

          {plans.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {plans.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPlan(p); setScale(1); }}
                  className={`shrink-0 rounded-lg border-2 overflow-hidden w-16 h-16 ${
                    selectedPlan.id === p.id ? "border-primary" : "border-transparent"
                  }`}
                >
                  <img src={p.imageData} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-muted-foreground text-center">Aucun plan sauvegardé.<br />Scannez un plan d'abord.</p>
        </div>
      )}
    </div>
  );
};

export default PlanViewerPage;
