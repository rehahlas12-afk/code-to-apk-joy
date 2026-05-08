// Service audio "background" — basé sur Web APIs (compatible WebView Capacitor)
// - MediaSession : intercepte bouton casque (play/pause) globalement
// - Audio focus  : lecture d'un buffer silencieux pour réserver le canal audio
// - Wake Lock    : empêche la mise en veille
// - Notification : MediaSession affiche automatiquement une notification persistante

let silentAudio: HTMLAudioElement | null = null;
let wakeLock: any = null;
let voiceTriggerHandler: (() => void) | null = null;
let started = false;

// Petit son silencieux (1s WAV) encodé base64 — en boucle pour garder l'audio focus
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

export function setVoiceTrigger(fn: (() => void) | null) {
  voiceTriggerHandler = fn;
}

async function acquireWakeLock() {
  try {
    const nav: any = navigator;
    if (nav.wakeLock?.request) {
      wakeLock = await nav.wakeLock.request("screen");
      wakeLock.addEventListener?.("release", () => { wakeLock = null; });
    }
  } catch {}
}

export async function startAudioService() {
  if (started) return;
  started = true;

  // Lecture audio silencieuse en boucle = audio focus + notification MediaSession
  try {
    silentAudio = new Audio(SILENT_WAV);
    silentAudio.loop = true;
    silentAudio.volume = 0.001; // quasi-muet (mais pas 0 sinon Chrome ne réserve pas)
    await silentAudio.play().catch(() => {});
  } catch {}

  // MediaSession : métadonnées (apparaissent dans la notification système)
  try {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "SABRINOS — Recherche vocale",
        artist: "Appuyez sur le bouton casque pour parler",
        album: "Gestion des plans",
      });
      navigator.mediaSession.playbackState = "playing";

      const handler = () => { voiceTriggerHandler?.(); };
      navigator.mediaSession.setActionHandler("play", handler);
      navigator.mediaSession.setActionHandler("pause", handler);
      try { navigator.mediaSession.setActionHandler("stop", () => stopAudioService()); } catch {}
    }
  } catch {}

  await acquireWakeLock();

  // Reprendre wake lock si l'app revient au premier plan
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") acquireWakeLock();
  });
}

export async function stopAudioService() {
  started = false;
  try { silentAudio?.pause(); silentAudio = null; } catch {}
  try { wakeLock?.release?.(); wakeLock = null; } catch {}
  try {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      try { navigator.mediaSession.setActionHandler("stop", null); } catch {}
      navigator.mediaSession.playbackState = "none";
    }
  } catch {}
}

export async function quitApplication() {
  await stopAudioService();
  try {
    const { App } = await import("@capacitor/app");
    await App.exitApp();
    return;
  } catch {}
  try { window.close(); } catch {}
  setTimeout(() => window.location.replace("about:blank"), 50);
}
