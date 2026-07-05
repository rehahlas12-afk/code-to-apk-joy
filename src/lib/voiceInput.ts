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
      try { await native.removeAllListeners?.(); } catch {}
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
      let ended = false;
      let stoppedSeen = false;
      let finishTimer: ReturnType<typeof setTimeout> | null = null;
      let partialListener: any = null;
      let listeningListener: any = null;

      const clearFinishTimer = () => {
        if (!finishTimer) return;
        clearTimeout(finishTimer);
        finishTimer = null;
      };

      const finish = () => {
        if (ended) return;
        ended = true;
        clearFinishTimer();
        try { partialListener?.remove?.(); } catch {}
        try { listeningListener?.remove?.(); } catch {}
        cb.onEnd?.();
      };

      const emitFinal = (text: string) => {
        if (finalSent) return;
        const t = (text || "").trim();
        if (!t) return;
        finalSent = true;
        cb.onFinal(t);
      };

      const scheduleFinish = (delay = 1200) => {
        clearFinishTimer();
        finishTimer = setTimeout(() => {
          if (!finalSent && lastPartial) emitFinal(lastPartial);
          finish();
        }, delay);
      };

      partialListener = await native.addListener("partialResults", (data: any) => {
        const text = (data?.matches?.[0] ?? "").toString();
        if (!text) return;
        lastPartial = text;
        cb.onPartial?.(text);

        // Sur Android le plugin envoie souvent le résultat final via
        // "partialResults" APRÈS l'événement "stopped". On garde donc
        // l'écoute ouverte quelques instants et on valide ce texte.
        if (stoppedSeen) {
          emitFinal(text);
          scheduleFinish(150);
        }
      });
      listeningListener = await native.addListener("listeningState", (data: any) => {
        if (data?.status === "started") {
          stoppedSeen = false;
          clearFinishTimer();
        }
        if (data?.status === "stopped") {
          stoppedSeen = true;
          scheduleFinish(1500);
        }
      });
      // Android : les résultats partiels ne marchent pas avec popup=true.
      // Avec partialResults=true, start() peut résoudre tout de suite sans résultat :
      // on garde donc l'écoute active jusqu'à listeningState=stopped ou stop().
      native.start({
        language: "fr-FR",
        prompt: "",
        partialResults: true,
        popup: false,
        maxResults: 1,
      }).then((res: any) => {
        const matches: string[] = res?.matches ?? [];
        if (matches.length) emitFinal(matches[0]);
        if (matches.length) scheduleFinish(150);
      }).catch((e: any) => {
        if (!finalSent && lastPartial) emitFinal(lastPartial);
        cb.onError?.(String(e?.message ?? e));
        scheduleFinish(150);
      });
      return {
        stop: async () => {
          try { await native.stop(); } catch {}
          if (!finalSent && lastPartial) emitFinal(lastPartial);
          finish();
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
  let finalSent = false;
  const emitFinal = (text: string) => {
    const t = (text || "").trim();
    if (!t || finalSent) return;
    finalSent = true;
    cb.onFinal(t);
  };
  rec.onresult = (event: any) => {
    let text = "";
    for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
    lastText = text;
    if (event.results[event.results.length - 1].isFinal) {
      emitFinal(text);
    } else {
      cb.onPartial?.(text);
    }
  };
  rec.onerror = (e: any) => { cb.onError?.(String(e?.error ?? "erreur")); cb.onEnd?.(); };
  rec.onend = () => { if (lastText) emitFinal(lastText); cb.onEnd?.(); };
  rec.start();
  return {
    stop: async () => { try { rec.stop(); } catch {}; if (lastText) emitFinal(lastText); cb.onEnd?.(); },
  };
}
