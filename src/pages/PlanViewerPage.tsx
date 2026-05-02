import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Trash2, Check, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { activatePlan, deletePlan, getActivePlan, getPlans } from "@/lib/store";
import TruckLogo from "@/components/TruckLogo";
import { toast } from "@/hooks/use-toast";

const PlanViewerPage = () => {
  const navigate = useNavigate();
  const initialPlans = getPlans();
  const [plans, setPlans] = useState(initialPlans);
  const [selectedPlan, setSelectedPlan] = useState(getActivePlan() || initialPlans[0] || null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const lastDistRef = useRef<number | null>(null);
  const lastPanRef = useRef<{ x: number; y: number } | null>(null);
  const lastCenterRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!selectedPlan) return;
    const activePlan = getActivePlan();
    if (activePlan?.id === selectedPlan.id) return;
    activatePlan(selectedPlan.id);
  }, [selectedPlan]);

  const reset = () => {
    setScale(1);
    setTx(0);
    setTy(0);
  };

  const selectPlan = (plan: typeof selectedPlan) => {
    if (!plan) return;
    const activePlan = activatePlan(plan.id) ?? plan;
    setSelectedPlan(plan);
    reset();
    toast({
      title: "Plan actif",
      description: activePlan.stores.length > 0
        ? `${activePlan.stores.length} magasins chargés`
        : "Plan sélectionné, aucun magasin détecté.",
    });
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastDistRef.current = Math.sqrt(dx * dx + dy * dy);
        lastCenterRef.current = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };
        lastPanRef.current = null;
      } else if (e.touches.length === 1) {
        lastPanRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        lastDistRef.current = null;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;

        if (lastDistRef.current !== null) {
          const delta = dist / lastDistRef.current;
          setScale(s => Math.min(8, Math.max(1, s * delta)));
        }
        if (lastCenterRef.current) {
          setTx(t => t + (cx - lastCenterRef.current!.x));
          setTy(t => t + (cy - lastCenterRef.current!.y));
        }
        lastDistRef.current = dist;
        lastCenterRef.current = { x: cx, y: cy };
      } else if (e.touches.length === 1 && lastPanRef.current) {
        e.preventDefault();
        const dx = e.touches[0].clientX - lastPanRef.current.x;
        const dy = e.touches[0].clientY - lastPanRef.current.y;
        setTx(t => t + dx);
        setTy(t => t + dy);
        lastPanRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        lastDistRef.current = null;
        lastCenterRef.current = null;
      }
      if (e.touches.length === 0) {
        lastPanRef.current = null;
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
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
              {selectedPlan.date} • {selectedPlan.stores.length} magasins • {Math.round(scale * 100)}%
            </p>
            <button onClick={() => handleDelete(selectedPlan.id)} className="p-2 text-red-500">
              <Trash2 size={18} />
            </button>
          </div>

          <div
            ref={containerRef}
            className="flex-1 overflow-hidden rounded-xl border border-gray-700 bg-gray-900 min-h-0 relative flex items-center justify-center"
            style={{ touchAction: "none" }}
          >
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
                transformOrigin: "center center",
                willChange: "transform",
              }}
            >
              <img
                src={selectedPlan.imageData}
                alt="Plan"
                draggable={false}
                className="max-w-full max-h-full object-contain select-none"
              />
            </div>

            <div className="absolute bottom-3 right-3 flex flex-col gap-2">
              <button
                onClick={() => setScale(s => Math.min(8, s * 1.4))}
                className="bg-black/80 border border-gray-600 rounded-full p-3 text-white shadow-lg"
                aria-label="Zoom +"
              >
                <ZoomIn size={22} />
              </button>
              <button
                onClick={() => setScale(s => Math.max(1, s / 1.4))}
                className="bg-black/80 border border-gray-600 rounded-full p-3 text-white shadow-lg"
                aria-label="Zoom -"
              >
                <ZoomOut size={22} />
              </button>
              <button
                onClick={reset}
                className="bg-black/80 border border-gray-600 rounded-full p-3 text-white shadow-lg"
                aria-label="Réinitialiser"
              >
                <Maximize2 size={22} />
              </button>
            </div>
          </div>

          <p className="text-xs text-center text-gray-500">
            Pincez 2 doigts pour zoomer (jusqu'à 800%) • Glissez pour déplacer
          </p>
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
