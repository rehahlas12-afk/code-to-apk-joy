import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import jsPDF from "jspdf";
import { getActivePlan } from "@/lib/store";
import { base64FromDataUrl, saveBase64ToPhone, sharePhoneFile } from "@/lib/nativeFile";

const OPEN_COUNT_KEY = "staf_open_count";
const OPEN_COUNT_LAST_KEY = "staf_open_count_last";

export function incrementOpenCount(): number {
  const cur = Number(localStorage.getItem(OPEN_COUNT_KEY) || "0") + 1;
  localStorage.setItem(OPEN_COUNT_KEY, String(cur));
  localStorage.setItem(OPEN_COUNT_LAST_KEY, new Date().toISOString());
  return cur;
}
export function getOpenCount(): number {
  return Number(localStorage.getItem(OPEN_COUNT_KEY) || "0");
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function buildPlanPDF(): Promise<{ blob: Blob; base64: string; fname: string } | null> {
  const plan = getActivePlan();
  if (!plan?.imageData) return null;
  const img = await loadImg(plan.imageData);
  const isLandscape = img.width > img.height;
  const pdf = new jsPDF({ orientation: isLandscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2 - 10;
  const ratio = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * ratio;
  const h = img.height * ratio;
  const x = (pageW - w) / 2;
  const y = margin + 8;
  pdf.setFontSize(11);
  pdf.text(`Plan STAF — ${plan.date} ${plan.time} — ${plan.stores.length} magasins / ${plan.stores.length} tournées`, margin, margin + 4);
  pdf.addImage(plan.imageData, "JPEG", x, y, w, h, undefined, "FAST");
  const blob = pdf.output("blob");
  const base64 = (pdf.output("datauristring") as string).split(",")[1];
  const fname = `plan-staf-${Date.now()}.pdf`;
  return { blob, base64, fname };
}

/** Partage le plan actif en image via le menu natif (WhatsApp, SMS, etc.) */
export async function sharePlanActive(): Promise<{ ok: boolean; message: string }> {
  const plan = getActivePlan();
  if (!plan?.imageData) {
    return { ok: false, message: "Aucun plan actif à partager. Scanne un plan d'abord." };
  }
  const text = `Plan STAF Transport — ${plan.date} ${plan.time}`;

  if (Capacitor.isNativePlatform()) {
    try {
      const fname = `plan-staf-${Date.now()}.jpg`;
      const saved = await saveBase64ToPhone(fname, base64FromDataUrl(plan.imageData));
      await sharePhoneFile({ uri: saved.uri, title: "Plan STAF", text, dialogTitle: "Partager le plan" });
      return { ok: true, message: `Plan enregistré dans ${saved.label}` };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Partage annulé" };
    }
  }

  try {
    const res = await fetch(plan.imageData);
    const blob = await res.blob();
    const file = new File([blob], "plan-staf.jpg", { type: blob.type || "image/jpeg" });
    const nav: any = navigator;
    if (nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ title: "Plan STAF", text, files: [file] });
      return { ok: true, message: "Plan partagé" };
    }
  } catch {}
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  return { ok: true, message: "Ouverture de WhatsApp" };
}

/** Partage le plan actif en PDF (téléchargeable + partageable). */
export async function sharePlanAsPDF(): Promise<{ ok: boolean; message: string }> {
  const built = await buildPlanPDF();
  if (!built) return { ok: false, message: "Aucun plan actif. Scanne un plan d'abord." };
  const { blob, base64, fname } = built;
  const text = "Plan STAF Transport (PDF)";

  if (Capacitor.isNativePlatform()) {
    try {
      const saved = await saveBase64ToPhone(fname, base64);
      await sharePhoneFile({ uri: saved.uri, title: "Plan STAF (PDF)", text, dialogTitle: "Partager le PDF" });
      return { ok: true, message: `PDF enregistré dans ${saved.label}` };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Partage annulé" };
    }
  }

  // Web: download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { ok: true, message: "PDF téléchargé" };
}
