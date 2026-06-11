import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { getActivePlan } from "@/lib/store";

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

/** Partage le plan actif via le menu natif (WhatsApp, SMS, etc.) ou WhatsApp web en fallback. */
export async function sharePlanActive(): Promise<{ ok: boolean; message: string }> {
  const plan = getActivePlan();
  if (!plan?.imageData) {
    return { ok: false, message: "Aucun plan actif à partager. Scanne un plan d'abord." };
  }
  const text = `Plan STAF Transport — ${plan.date} ${plan.time}`;

  if (Capacitor.isNativePlatform()) {
    try {
      const base64 = plan.imageData.includes(",")
        ? plan.imageData.split(",")[1]
        : plan.imageData;
      const fname = `plan-staf-${Date.now()}.jpg`;
      await Filesystem.writeFile({
        path: fname,
        data: base64,
        directory: Directory.Cache,
      });
      const file = await Filesystem.getUri({ path: fname, directory: Directory.Cache });
      await Share.share({
        title: "Plan STAF",
        text,
        url: file.uri,
        dialogTitle: "Partager le plan (WhatsApp, SMS, Email…)",
      });
      return { ok: true, message: "Plan partagé" };
    } catch (e: any) {
      return { ok: false, message: e?.message || "Partage annulé" };
    }
  }

  // Web fallback
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
  // WhatsApp web ultime fallback (texte seul)
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  return { ok: true, message: "Ouverture de WhatsApp" };
}
