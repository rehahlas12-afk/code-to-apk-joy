import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, Trash2, Loader2 } from "lucide-react";
import { activatePlan, getPlanStorageErrorMessage, getPlans, isQuotaExceededError, savePlan, deletePlan, updatePlanStores, type PlanRecord } from "@/lib/store";
import { MIN_RELIABLE_PLAN_STORES, ocrAnalyzePlan } from "@/lib/ocr";
import { readAndOptimizeImageFile } from "@/lib/planImage";
import TruckLogo from "@/components/TruckLogo";
import { toast } from "@/hooks/use-toast";

const GalleryPage = () => {
  const navigate = useNavigate();
  const [plans, setPlansState] = useState(getPlans());
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const analyzeAndSavePlan = async (plan: PlanRecord) => {
    setAnalyzingId(plan.id);
    setOcrProgress(0);
    try {
      const detectedStores = await ocrAnalyzePlan(plan.imageData, (p) => setOcrProgress(p));
      const updatedPlan = updatePlanStores(plan.id, detectedStores);
      if (!updatedPlan) {
        throw new Error("Plan introuvable après import");
      }
      setPlansState(getPlans());
      toast({
        title: "✅ Analyse terminée",
        description: `${detectedStores.length} magasins détectés`,
      });
    } catch (err) {
      console.error("OCR error:", err);
      toast({
        title: isQuotaExceededError(err) ? "Stockage saturé" : "Erreur OCR",
        description: isQuotaExceededError(err) ? getPlanStorageErrorMessage(err) : "Vérifiez la qualité de l'image",
        variant: "destructive",
      });
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const optimizedImage = await readAndOptimizeImageFile(file);
      const now = new Date();
      const newPlan: PlanRecord = {
        id: crypto.randomUUID(),
        imageData: optimizedImage,
        stores: [],
        date: now.toLocaleDateString("fr-FR"),
        time: now.toLocaleTimeString("fr-FR"),
      };

      savePlan(newPlan);
      setPlansState(getPlans());
      toast({ title: "Plan importé", description: "Analyse OCR complète en cours..." });
      await analyzeAndSavePlan(newPlan);
    } catch (error) {
      console.error("Plan upload error:", error);
      toast({
        title: "Import impossible",
        description: getPlanStorageErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      e.target.value = "";
    }
  };

  const handleDelete = (id: string) => {
    deletePlan(id);
    setPlansState(getPlans());
    toast({ title: "Plan supprimé" });
  };

  const handleSelect = (plan: PlanRecord) => {
    const activePlan = activatePlan(plan.id);

    if (activePlan?.stores.length) {
      toast({ title: "Plan actif", description: `${activePlan.stores.length} magasins chargés pour la recherche` });
    } else {
      toast({ title: "⚠️ Aucun magasin", description: "Ce plan n'a pas encore été analysé. Relancez l'analyse.", variant: "destructive" });
    }
    navigate("/plan-viewer");
  };

  return (
    <div className="min-h-screen bg-black flex flex-col text-white">
      <TruckLogo />
      <div className="flex items-center gap-3 px-4 py-2">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-gray-800">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">Galerie</h1>
        <div className="flex-1" />
        <button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 text-white rounded-lg px-4 py-2 flex items-center gap-2 text-sm font-bold">
          <Upload size={16} /> Importer
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      </div>

      {analyzingId && (
        <div className="mx-4 mb-2 bg-blue-900/40 border border-blue-500/50 rounded-xl p-3 flex items-center gap-3">
          <Loader2 size={20} className="animate-spin text-blue-400" />
          <span className="text-sm text-blue-300">Analyse OCR en cours... {ocrProgress}%</span>
        </div>
      )}

      <div className="p-4">
        {plans.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {plans.map((plan) => (
              <div key={plan.id} className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
                <img
                  src={plan.imageData}
                  alt="Plan"
                  className="w-full aspect-square object-cover cursor-pointer"
                  onClick={() => handleSelect(plan)}
                />
                <div className="p-2 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold">{plan.date}</p>
                    <p className="text-xs text-gray-400">{plan.time}</p>
                    {plan.stores.length > 0 ? (
                      <p className="text-[10px] text-green-400">{plan.stores.length} mag.</p>
                    ) : (
                      <button
                        onClick={() => analyzeAndSavePlan(plan)}
                        disabled={analyzingId !== null}
                        className="text-[10px] text-yellow-400 underline disabled:opacity-50"
                      >
                        Analyser
                      </button>
                    )}
                  </div>
                  <button onClick={() => handleDelete(plan.id)} className="p-1 text-red-500">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-500 py-8 text-xl font-bold">Il n'y a pas de plan de travail.</p>
        )}
      </div>
    </div>
  );
};

export default GalleryPage;
