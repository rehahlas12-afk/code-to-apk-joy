import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mic, MicOff, Volume2 } from "lucide-react";
import { searchStore } from "@/lib/store";
import TruckLogo from "@/components/TruckLogo";

const VoiceSearchPage = () => {
  const navigate = useNavigate();
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const speak = useCallback((text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "fr-FR";
    speechSynthesis.speak(utterance);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setResult("La reconnaissance vocale n'est pas supportée");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "fr-FR";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);

      if (event.results[0].isFinal) {
        // Extract numbers from speech
        const numbers = text.replace(/\s/g, "").match(/\d+/g);
        if (numbers) {
          const query = numbers.join("");
          const found = searchStore(query);
          if (found) {
            const msg = `Magasin ${found.store.number}${found.name ? `, ${found.name}` : ""}, se trouve à la travée ${found.store.travee}, ${found.store.zone}`;
            setResult(msg);
            speak(msg);
          } else {
            const msg = `Magasin ${query} non trouvé`;
            setResult(msg);
            speak(msg);
          }
        } else {
          // Try name search
          const found = searchStore(text.trim());
          if (found) {
            const msg = `Magasin ${found.store.number}${found.name ? `, ${found.name}` : ""}, travée ${found.store.travee}, ${found.store.zone}`;
            setResult(msg);
            speak(msg);
          } else {
            setResult("Aucun magasin trouvé. Réessayez.");
            speak("Aucun magasin trouvé");
          }
        }
        setListening(false);
      }
    };

    recognition.onerror = () => {
      setListening(false);
      setResult("Erreur de reconnaissance vocale");
    };

    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    setResult(null);
    setTranscript("");
  }, [speak]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TruckLogo />
      <div className="flex items-center gap-3 p-4">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-muted">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">Recherche Vocale</h1>
      </div>

      <div className="flex-1 p-4 flex flex-col items-center justify-center gap-8">
        <button
          onClick={listening ? stopListening : startListening}
          className={`w-32 h-32 rounded-full flex items-center justify-center shadow-xl transition-all ${
            listening
              ? "bg-destructive text-destructive-foreground animate-pulse scale-110"
              : "bg-accent text-accent-foreground"
          }`}
        >
          {listening ? <MicOff size={48} /> : <Mic size={48} />}
        </button>

        <p className="text-muted-foreground text-center text-sm">
          {listening ? "Parlez maintenant..." : "Appuyez pour parler"}
        </p>

        {transcript && (
          <div className="bg-muted rounded-xl p-4 w-full">
            <p className="text-sm text-muted-foreground">Entendu :</p>
            <p className="font-bold">{transcript}</p>
          </div>
        )}

        {result && (
          <div className="bg-card border rounded-xl p-4 w-full shadow-md">
            <div className="flex items-start gap-3">
              <Volume2 size={20} className="text-accent mt-1 shrink-0" />
              <p className="font-semibold text-base">{result}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceSearchPage;
