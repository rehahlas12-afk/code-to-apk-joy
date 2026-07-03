// Unified voice input for web + native (Capacitor)
// Uses @capacitor-community/speech-recognition on native, webkitSpeechRecognition on web.
import { Capacitor } from "@capacitor/core";

let nativeMod: any = null;
async function getNative() {
  if (!Capacitor.isNativePlatform()) return null;
  if (nativeMod) return nativeMod;
  try {
    const mod = await import("@capacitor-community/speech-recognition");
    nativeMod = mod.SpeechRecognition;
    return nativeMod;
  } catch {
    return null;
  }
}

export interface VoiceHandle {
  stop: () => Promise<void>;
}

export interface VoiceCallbacks {
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (err: string) => void;
  onEnd?: () => void;
}

export async function startVoice(cb: VoiceCallbacks): Promise<VoiceHandle | null> {
  const native = await getNative();
  if (native) {
    try {
      const perm = await native.checkPermissions();
      if (perm.speechRecognition !== "granted") {
        const req = await native.requestPermissions();
        if (req.speechRecognition !== "granted") {
          cb.onError?.("Permission micro refusée");
          return null;
        }
      }
      const avail = await native.available();
      if (!avail.available) {
        cb.onError?.("Reconnaissance vocale indisponible");
        return null;
      }
      let lastPartial = "";
      let finalSent = false;
      const emitFinal = (text: string) => {
        if (finalSent) return;
        const t = (text || "").trim();
        if (!t) return;
        finalSent = true;
        cb.onFinal(t);
      };
      const partialListener = await native.addListener("partialResults", (data: any) => {
        const text = (data?.matches?.[0] ?? "").toString();
        if (text) { lastPartial = text; cb.onPartial?.(text); }
      });
      const listeningListener = await native.addListener("listeningState", (data: any) => {
        if (data?.status === "stopped") {
          if (!finalSent && lastPartial) emitFinal(lastPartial);
          cb.onEnd?.();
        }
      });
      native.start({
        language: "fr-FR",
        partialResults: true,
        popup: false,
        maxResults: 1,
      }).then((res: any) => {
        const matches: string[] = res?.matches ?? [];
        if (matches.length) emitFinal(matches[0]);
        else if (lastPartial) emitFinal(lastPartial);
      }).catch((e: any) => {
        cb.onError?.(String(e?.message ?? e));
        cb.onEnd?.();
      });
      return {
        stop: async () => {
          try { await native.stop(); } catch {}
          if (!finalSent && lastPartial) emitFinal(lastPartial);
          try { partialListener.remove(); } catch {}
          try { listeningListener.remove(); } catch {}
        },
      };
    } catch (e: any) {
      cb.onError?.(String(e?.message ?? e));
      return null;
    }
  }

  // Web fallback
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) {
    cb.onError?.("Reconnaissance vocale non supportée");
    return null;
  }
  const rec = new SR();
  rec.lang = "fr-FR";
  rec.continuous = false;
  rec.interimResults = true;
  let lastText = "";
  rec.onresult = (event: any) => {
    let text = "";
    for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
    lastText = text;
    if (event.results[event.results.length - 1].isFinal) {
      cb.onFinal(text);
    } else {
      cb.onPartial?.(text);
    }
  };
  rec.onerror = (e: any) => cb.onError?.(String(e?.error ?? "erreur"));
  rec.onend = () => { cb.onEnd?.(); if (lastText && !rec._finalSent) { /* noop */ } };
  rec.start();
  return {
    stop: async () => { try { rec.stop(); } catch {} },
  };
}
