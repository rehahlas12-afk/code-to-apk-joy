import { Capacitor } from "@capacitor/core";
import { QueueStrategy, TextToSpeech } from "@capacitor-community/text-to-speech";

export async function stopSpeaking(): Promise<void> {
  try { window.speechSynthesis?.cancel?.(); } catch {}

  if (!Capacitor.isNativePlatform()) return;
  try { await TextToSpeech.stop(); } catch {}
}

export async function speakFr(text: string): Promise<void> {
  const clean = text.trim();
  if (!clean) return;

  if (Capacitor.isNativePlatform()) {
    try {
      await TextToSpeech.stop();
      await TextToSpeech.speak({
        text: clean,
        lang: "fr-FR",
        rate: 0.95,
        pitch: 1,
        volume: 1,
        queueStrategy: QueueStrategy.Flush,
      });
      return;
    } catch {
      // Fallback WebView ci-dessous.
    }
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = "fr-FR";
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  } catch {
    // La synthèse vocale n'est pas disponible sur cet appareil.
  }
}