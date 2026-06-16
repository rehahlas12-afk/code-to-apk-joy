import { useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, Upload, Sun, Moon, ImageIcon } from "lucide-react";
import { getPlanStorageErrorMessage, isQuotaExceededError, savePlan } from "@/lib/store";
import { ocrAnalyzePlan } from "@/lib/ocr";
import { optimizePlanImage, readAndOptimizeImageFile } from "@/lib/planImage";
import { toast } from "@/hooks/use-toast";
import TruckLogo from "@/components/TruckLogo";

type Mode = "original" | "clair" | "sombre";

const CameraPage = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("original");
  const [analyzing, setAnalyzing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setStreaming(true);
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible d'accéder à la caméra", variant: "destructive" });
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
      setStreaming(false);
    }
  }, []);

  const applyMode = useCallback(async (src: string, m: Mode): Promise<string> => {
    if (m === "original") return src;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height);
        const px = d.data;
        if (m === "sombre") {
          // Invert + boost contrast → fond noir, texte blanc
          for (let i = 0; i < px.length; i += 4) {
            const r = 255 - px[i], g = 255 - px[i + 1], b = 255 - px[i + 2];
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            const v = lum < 90 ? 0 : lum > 170 ? 255 : Math.round((lum - 90) * 255 / 80);
            px[i] = v; px[i + 1] = v; px[i + 2] = v;
          }
        } else {
          // Clair : N&B haute lisibilité
          for (let i = 0; i < px.length; i += 4) {
            const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
            const v = lum < 110 ? 0 : lum > 180 ? 255 : Math.round((lum - 110) * 255 / 70);
            px[i] = v; px[i + 1] = v; px[i + 2] = v;
          }
        }
        ctx.putImageData(d, 0, 0);
        resolve(c.toDataURL("image/jpeg", 0.92));
      };
      img.onerror = reject;
      img.src = src;
    });
  }, []);

  const changeMode = useCallback(async (m: Mode) => {
    if (!originalImage) return;
    setMode(m);
    try {
      const out = await applyMode(originalImage, m);
      setCapturedImage(out);
    } catch {
      toast({ title: "Impossible d'appliquer le mode", variant: "destructive" });
    }
  }, [originalImage, applyMode]);

  const capture = useCallback(async () => {
    if (!videoRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(videoRef.current, 0, 0);

    try {
      const dataUrl = await optimizePlanImage(canvas.toDataURL("image/jpeg", 0.92));
      setOriginalImage(dataUrl);
      setCapturedImage(dataUrl);
      setMode("original");
      stopCamera();
    } catch (error) {
      console.error("Capture error:", error);
      toast({ title: "Capture impossible", description: "Impossible de préparer ce plan", variant: "destructive" });
    }
  }, [stopCamera]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const optimizedImage = await readAndOptimizeImageFile(file);
      setOriginalImage(optimizedImage);
      setCapturedImage(optimizedImage);
      setMode("original");
      stopCamera();
    } catch (error) {
      console.error("File upload error:", error);
      toast({ title: "Import impossible", description: getPlanStorageErrorMessage(error), variant: "destructive" });
    } finally {
      e.target.value = "";
    }
  };

  const analyzePlan = async () => {
    if (!capturedImage) return;
    setAnalyzing(true);
    setOcrProgress(0);

    try {
      // Real OCR analysis with Tesseract.js
      const detectedStores = await ocrAnalyzePlan(capturedImage, (p) => setOcrProgress(p));

      if (detectedStores.length === 0) {
        toast({ title: "⚠️ Aucun magasin détecté", description: "Essayez avec une photo plus nette ou mieux éclairée", variant: "destructive" });
        setAnalyzing(false);
        return;
      }

      const now = new Date();
      savePlan({
        id: crypto.randomUUID(),
        imageData: capturedImage,
        stores: detectedStores,
        date: now.toLocaleDateString("fr-FR"),
        time: now.toLocaleTimeString("fr-FR"),
      });

      toast({ title: "✅ Analyse terminée", description: `${detectedStores.length} magasins détectés sur ce plan` });
      navigate("/plan-viewer");
    } catch (err) {
      console.error("OCR error:", err);
      toast({
        title: isQuotaExceededError(err) ? "Stockage saturé" : "Erreur d'analyse OCR",
        description: isQuotaExceededError(err) ? getPlanStorageErrorMessage(err) : "Vérifiez la qualité de l'image",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col text-white">
      <TruckLogo />
      <div className="flex items-center gap-3 px-4 py-2">
        <button onClick={() => { stopCamera(); navigate("/"); }} className="p-2 rounded-lg bg-gray-800">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">Scanner le Plan</h1>
      </div>

      <div className="flex-1 px-3 pb-3 flex flex-col gap-3">
        {!capturedImage ? (
          <>
            {/* Full height camera view */}
            <div className="relative flex-1 bg-gray-900 rounded-xl overflow-hidden min-h-0">
              <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
              {!streaming && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-gray-500 text-sm">Caméra inactive</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 shrink-0">
              {!streaming ? (
                <button onClick={startCamera} className="flex-1 bg-blue-600 text-white rounded-xl p-4 flex items-center justify-center gap-2 font-bold text-lg">
                  <Camera size={24} /> Ouvrir Caméra
                </button>
              ) : (
                <button onClick={capture} className="flex-1 bg-green-600 text-white rounded-xl p-4 flex items-center justify-center gap-2 font-bold text-lg">
                  <Camera size={24} /> Capturer
                </button>
              )}
              <button onClick={() => fileInputRef.current?.click()} className="bg-gray-700 text-white rounded-xl p-4 flex items-center justify-center">
                <Upload size={24} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 rounded-xl overflow-hidden min-h-0 bg-black">
              <img src={capturedImage} alt="Plan capturé" className="w-full h-full object-contain" />
            </div>
            {/* Choix du mode d'affichage du plan */}
            <div className="grid grid-cols-3 gap-2 shrink-0">
              <button
                onClick={() => changeMode("original")}
                className={`rounded-xl p-3 flex flex-col items-center gap-1 font-bold text-xs border-2 ${mode === "original" ? "bg-blue-600 border-white" : "bg-gray-800 border-gray-700"}`}
              >
                <ImageIcon size={20} /> Original
              </button>
              <button
                onClick={() => changeMode("clair")}
                className={`rounded-xl p-3 flex flex-col items-center gap-1 font-bold text-xs border-2 ${mode === "clair" ? "bg-yellow-500 text-black border-white" : "bg-gray-800 border-gray-700"}`}
              >
                <Sun size={20} /> Clair
              </button>
              <button
                onClick={() => changeMode("sombre")}
                className={`rounded-xl p-3 flex flex-col items-center gap-1 font-bold text-xs border-2 ${mode === "sombre" ? "bg-indigo-700 border-white" : "bg-gray-800 border-gray-700"}`}
              >
                <Moon size={20} /> Sombre
              </button>
            </div>
            <div className="flex gap-3 shrink-0">
              <button onClick={() => { setCapturedImage(null); setOriginalImage(null); setMode("original"); }} className="flex-1 bg-gray-700 rounded-xl p-4 font-bold text-lg">
                Reprendre
              </button>
              <button onClick={analyzePlan} disabled={analyzing} className="flex-1 bg-green-600 text-white rounded-xl p-4 font-bold text-lg disabled:opacity-50">
                {analyzing ? `OCR ${ocrProgress}%...` : "✅ Analyser (OCR)"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CameraPage;
