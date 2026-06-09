import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";
import TruckLogo from "@/components/TruckLogo";
import { toast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import formImg from "@/assets/conge-form.jpg.asset.json";

const STORAGE_KEY = "staf_conge_info";

interface CongeInfo {
  nom: string;
  prenom: string;
  code: string;
  lieu: string;
  date1Du: string;
  date1Au: string;
  date2Du: string;
  date2Au: string;
  date3Du: string;
  date3Au: string;
}

const empty: CongeInfo = {
  nom: "", prenom: "", code: "", lieu: "",
  date1Du: "", date1Au: "", date2Du: "", date2Au: "", date3Du: "", date3Au: "",
};

function fmt(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  if (!y) return d;
  return `${day}/${m}/${y}`;
}

const CongesPage = () => {
  const navigate = useNavigate();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState<CongeInfo>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...empty, ...JSON.parse(saved) };
    } catch {}
    return empty;
  });
  const [today] = useState(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  });

  useEffect(() => {
    // Persist nom/prenom/code/lieu (utiles à chaque demande)
    const { nom, prenom, code, lieu } = info;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nom, prenom, code, lieu }));
  }, [info]);

  const upd = (k: keyof CongeInfo) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setInfo(prev => ({ ...prev, [k]: e.target.value }));

  const handleDownload = async () => {
    if (!sheetRef.current) return;
    try {
      const canvas = await html2canvas(sheetRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const ratio = canvas.width / canvas.height;
      let w = pageW, h = pageW / ratio;
      if (h > pageH) { h = pageH; w = pageH * ratio; }
      pdf.addImage(imgData, "JPEG", (pageW - w) / 2, (pageH - h) / 2, w, h);
      const fname = `Conge_${info.nom || "STAF"}_${info.prenom || ""}_${new Date().toISOString().slice(0,10)}.pdf`;
      pdf.save(fname.replace(/\s+/g, "_"));
      toast({ title: "✅ PDF téléchargé" });
    } catch (err: any) {
      toast({ title: "Erreur", description: err?.message || "Impossible de générer le PDF", variant: "destructive" });
    }
  };

  // Positions (en %) calibrées sur l'image du formulaire scanné
  const overlay = "absolute font-bold text-black whitespace-nowrap";

  return (
    <div className="min-h-screen bg-black flex flex-col text-white">
      <TruckLogo />
      <div className="flex items-center gap-3 px-4 py-2">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-gray-800">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">Demande de congé</h1>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {/* Formulaire de saisie */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={info.nom} onChange={upd("nom")} placeholder="Nom"
              className="rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-base text-white" />
            <input value={info.prenom} onChange={upd("prenom")} placeholder="Prénom"
              className="rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-base text-white" />
            <input value={info.code} onChange={upd("code")} placeholder="Code"
              className="rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-base text-white" />
            <input value={info.lieu} onChange={upd("lieu")} placeholder="Lieu d'affectation"
              className="rounded-lg bg-gray-800 border border-gray-600 px-3 py-3 text-base text-white" />
          </div>

          {[1, 2, 3].map((n) => (
            <div key={n} className="grid grid-cols-[auto_1fr_1fr] gap-2 items-center">
              <span className="text-sm font-bold text-gray-300 w-14">Date {n}</span>
              <input type="date" value={(info as any)[`date${n}Du`]} onChange={upd(`date${n}Du` as keyof CongeInfo)}
                className="rounded-lg bg-gray-800 border border-gray-600 px-2 py-2 text-sm text-white" />
              <input type="date" value={(info as any)[`date${n}Au`]} onChange={upd(`date${n}Au` as keyof CongeInfo)}
                className="rounded-lg bg-gray-800 border border-gray-600 px-2 py-2 text-sm text-white" />
            </div>
          ))}

          <button onClick={handleDownload}
            className="w-full bg-green-600 text-white rounded-xl py-4 font-black text-lg flex items-center justify-center gap-2 mt-2">
            <Download size={22} /> Télécharger en PDF
          </button>
        </div>

        {/* Aperçu du papier rempli */}
        <p className="text-xs text-gray-400 text-center">Aperçu du papier rempli</p>
        <div className="overflow-x-auto bg-white rounded-lg">
          <div
            ref={sheetRef}
            style={{ width: "1000px", position: "relative" }}
            className="bg-white"
          >
            <img src={formImg.url} alt="Formulaire congé" style={{ width: "100%", display: "block" }} />

            {/* Date (haut) */}
            <span className={overlay} style={{ top: "5.5%", left: "82%", fontSize: 18 }}>{today}</span>

            {/* Nom / Prénom / Code */}
            <span className={overlay} style={{ top: "16%", left: "8%", fontSize: 18 }}>{info.nom}</span>
            <span className={overlay} style={{ top: "16%", left: "42%", fontSize: 18 }}>{info.prenom}</span>
            <span className={overlay} style={{ top: "16%", left: "82%", fontSize: 18 }}>{info.code}</span>

            {/* Lieu */}
            <span className={overlay} style={{ top: "22%", left: "20%", fontSize: 18 }}>{info.lieu}</span>

            {/* Date 1 */}
            <span className={overlay} style={{ top: "35%", left: "20%", fontSize: 18 }}>{fmt(info.date1Du)}</span>
            <span className={overlay} style={{ top: "35%", left: "47%", fontSize: 18 }}>{fmt(info.date1Au)}</span>

            {/* Date 2 */}
            <span className={overlay} style={{ top: "43%", left: "20%", fontSize: 18 }}>{fmt(info.date2Du)}</span>
            <span className={overlay} style={{ top: "43%", left: "47%", fontSize: 18 }}>{fmt(info.date2Au)}</span>

            {/* Date 3 */}
            <span className={overlay} style={{ top: "51%", left: "20%", fontSize: 18 }}>{fmt(info.date3Du)}</span>
            <span className={overlay} style={{ top: "51%", left: "47%", fontSize: 18 }}>{fmt(info.date3Au)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CongesPage;
