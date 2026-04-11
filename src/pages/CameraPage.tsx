import { useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, Upload } from "lucide-react";
import { savePlan, setStores, type StoreData } from "@/lib/store";
import { toast } from "@/hooks/use-toast";
import TruckLogo from "@/components/TruckLogo";

const CameraPage = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

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

  const capture = useCallback(() => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(videoRef.current, 0, 0);
    // Enhance brightness/contrast
    ctx.filter = "brightness(1.2) contrast(1.3)";
    ctx.drawImage(canvas, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setCapturedImage(dataUrl);
    stopCamera();
  }, [stopCamera]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCapturedImage(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const analyzePlan = async () => {
    if (!capturedImage) return;
    setAnalyzing(true);
    
    // Simulate AI analysis - parse plan data from image
    // In production, this would call an AI service
    try {
      // Demo data based on the plan structure described
      const demoStores: StoreData[] = [
        { number: "99BIS3", travee: "99BIS3", zone: "Zone 1" },
        { number: "99BIS2", travee: "99BIS2", zone: "Zone 1" },
        { number: "99BIS", travee: "99BIS", zone: "Zone 1" },
        { number: "10892", travee: "99BIS", zone: "Zone 1" },
        { number: "9673", travee: "99", zone: "Zone 1" },
        { number: "8999", travee: "99", zone: "Zone 1" },
        { number: "8214", travee: "100", zone: "Zone 1" },
        { number: "10297", travee: "100", zone: "Zone 1" },
        { number: "8176", travee: "102", zone: "Zone 1" },
        { number: "9617", travee: "103", zone: "Zone 1" },
        { number: "9616", travee: "201", zone: "Zone 1" },
        { number: "10032", travee: "201", zone: "Zone 1" },
        { number: "7518", travee: "202", zone: "Zone 1" },
        { number: "6243", travee: "202", zone: "Zone 1" },
        { number: "8485", travee: "202", zone: "Zone 1" },
        { number: "7879", travee: "202", zone: "Zone 1" },
        { number: "8074", travee: "204", zone: "Zone 1" },
        { number: "11964", travee: "204", zone: "Zone 1" },
        { number: "7878", travee: "204", zone: "Zone 1" },
        { number: "7576", travee: "204", zone: "Zone 1" },
        { number: "9738", travee: "301", zone: "Zone 1" },
        { number: "9684", travee: "301", zone: "Zone 1" },
        { number: "7822", travee: "301", zone: "Zone 1" },
        { number: "7389", travee: "303", zone: "Zone 1" },
        { number: "2088", travee: "303", zone: "Zone 1" },
        { number: "9571", travee: "303", zone: "Zone 1" },
        { number: "2971", travee: "304", zone: "Zone 1" },
        { number: "9738", travee: "304", zone: "Zone 1" },
        { number: "7039", travee: "306", zone: "Zone 1" },
        { number: "8154", travee: "306", zone: "Zone 1" },
        { number: "8214", travee: "306", zone: "Zone 1" },
        { number: "10892", travee: "306", zone: "Zone 1" },
        { number: "12671", travee: "401", zone: "Zone 1" },
        { number: "9668", travee: "401", zone: "Zone 1" },
        { number: "8484", travee: "402", zone: "Zone 1" },
        { number: "7922", travee: "402", zone: "Zone 1" },
        { number: "9083", travee: "402", zone: "Zone 1" },
        { number: "11843", travee: "404", zone: "Zone 1" },
        { number: "8060", travee: "501", zone: "Zone 1" },
        { number: "9668", travee: "501", zone: "Zone 1" },
        { number: "10712", travee: "501", zone: "Zone 1" },
        { number: "6059", travee: "503", zone: "Zone 1" },
        { number: "8486", travee: "503", zone: "Zone 1" },
        { number: "7822", travee: "504", zone: "Zone 1" },
        { number: "7450", travee: "504", zone: "Zone 1" },
        { number: "11839", travee: "504", zone: "Zone 1" },
        { number: "8215", travee: "602", zone: "Zone 1" },
        { number: "8214", travee: "603", zone: "Zone 1" },
        { number: "8215", travee: "603", zone: "Zone 1" },
        { number: "9669", travee: "603", zone: "Zone 1" },
        { number: "10574", travee: "701", zone: "Zone 1" },
        { number: "11754", travee: "701", zone: "Zone 1" },
        { number: "9812", travee: "702", zone: "Zone 1" },
        { number: "9673", travee: "702", zone: "Zone 1" },
        { number: "9796", travee: "704", zone: "Zone 1" },
        { number: "7859", travee: "704", zone: "Zone 1" },
        { number: "9037", travee: "801", zone: "Zone 1" },
        { number: "6317", travee: "801", zone: "Zone 1" },
        { number: "8858", travee: "803", zone: "Zone 1" },
        { number: "9796", travee: "803", zone: "Zone 1" },
        // Zone Débord
        { number: "10892", travee: "DEB", zone: "Débord" },
        { number: "9083", travee: "DEB4", zone: "Débord" },
        { number: "7879", travee: "DEB4", zone: "Débord" },
        { number: "7576", travee: "DEB3", zone: "Débord" },
        { number: "7822", travee: "DEB2", zone: "Débord" },
        { number: "9571", travee: "DEB1", zone: "Débord" },
        { number: "8154", travee: "85", zone: "Débord" },
        { number: "10892", travee: "84", zone: "Débord" },
        { number: "9083", travee: "83", zone: "Débord" },
        { number: "8486", travee: "80", zone: "Débord" },
        { number: "11839", travee: "79", zone: "Débord" },
        { number: "9669", travee: "77", zone: "Débord" },
        { number: "9673", travee: "75", zone: "Débord" },
        { number: "6317", travee: "73", zone: "Débord" },
        { number: "9796", travee: "72", zone: "Débord" },
        // Zone Craft
        { number: "10678", travee: "86", zone: "Craft" },
        { number: "9562", travee: "87", zone: "Craft" },
        { number: "9660", travee: "88", zone: "Craft" },
        { number: "9083", travee: "89", zone: "Craft" },
        { number: "11694", travee: "90", zone: "Craft" },
        { number: "8074", travee: "91", zone: "Craft" },
        { number: "10574", travee: "92", zone: "Craft" },
        { number: "7859", travee: "94", zone: "Craft" },
        { number: "10032", travee: "95", zone: "Craft" },
      ];

      setStores(demoStores);

      const now = new Date();
      savePlan({
        id: crypto.randomUUID(),
        imageData: capturedImage,
        stores: demoStores,
        date: now.toLocaleDateString("fr-FR"),
        time: now.toLocaleTimeString("fr-FR"),
      });

      toast({ title: "Analyse terminée", description: `${demoStores.length} magasins détectés et sauvegardés` });
      navigate("/plan-viewer");
    } catch {
      toast({ title: "Erreur d'analyse", variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TruckLogo />
      <div className="flex items-center gap-3 p-4">
        <button onClick={() => { stopCamera(); navigate("/"); }} className="p-2 rounded-lg bg-muted">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">Scanner le Plan</h1>
      </div>

      <div className="flex-1 p-4 flex flex-col gap-4">
        {!capturedImage ? (
          <>
            <div className="relative bg-foreground/10 rounded-xl overflow-hidden aspect-[4/3]">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
              {!streaming && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-muted-foreground text-sm">Caméra inactive</p>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              {!streaming ? (
                <button onClick={startCamera} className="flex-1 bg-primary text-primary-foreground rounded-xl p-4 flex items-center justify-center gap-2 font-bold">
                  <Camera size={20} /> Ouvrir Caméra
                </button>
              ) : (
                <button onClick={capture} className="flex-1 bg-accent text-accent-foreground rounded-xl p-4 flex items-center justify-center gap-2 font-bold">
                  <Camera size={20} /> Capturer
                </button>
              )}
              <button onClick={() => fileInputRef.current?.click()} className="bg-secondary text-secondary-foreground rounded-xl p-4 flex items-center justify-center gap-2 font-bold">
                <Upload size={20} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl overflow-hidden">
              <img src={capturedImage} alt="Plan capturé" className="w-full" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setCapturedImage(null)} className="flex-1 bg-muted text-foreground rounded-xl p-4 font-bold">
                Reprendre
              </button>
              <button onClick={analyzePlan} disabled={analyzing} className="flex-1 bg-primary text-primary-foreground rounded-xl p-4 font-bold disabled:opacity-50">
                {analyzing ? "Analyse..." : "Analyser"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CameraPage;
