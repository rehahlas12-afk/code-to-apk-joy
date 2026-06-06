import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";

export async function quitApplication() {
  try { speechSynthesis.cancel(); } catch {}

  if (Capacitor.isNativePlatform()) {
    try {
      await CapacitorApp.exitApp();
      return;
    } catch {}
  }

  try { window.open("", "_self"); window.close(); } catch {}
  window.setTimeout(() => {
    try { window.location.href = "about:blank"; } catch {}
  }, 100);
}