import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mic, Search as SearchIcon, X } from "lucide-react";
import { searchStore, getActivePlan } from "@/lib/store";
import TruckLogo from "@/components/TruckLogo";

interface SearchResult {
  number: string;
  travee: string;
  zone: string;
  name?: string;
  position?: number; // 1, 2, 3...
  totalPositions?: number;
  others?: { travee: string; zone: string; position: number }[];
}

const ordinal = (n: number) => {
  if (n === 1) return "1ère position";
  return `${n}ème position`;
};

const SearchPage = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const speak = useCallback((text: string) => {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "fr-FR";
      u.rate = 0.95;
      speechSynthesis.speak(u);
    } catch {}
  }, []);

  const announce = useCallback((r: SearchResult) => {
    let msg = `Magasin ${r.number}`;
    if (r.name) msg += `, ${r.name}`;
    msg += `, travée ${r.travee}, ${r.zone}`;
    if (r.totalPositions && r.totalPositions > 1) {
      msg += `, ${ordinal(r.position!)} sur ${r.totalPositions} dans le trajet`;
    }
    speak(msg);
  }, [speak]);

  const runSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;

    const found = searchStore(trimmed);
    if (!found) {
      setResult(null);
      setNotFound(true);
      speak(`Magasin ${trimmed} non trouvé`);
      return;
    }

    // Compute position within the active plan, ordered by travée
    const plan = getActivePlan();
    const planStores = plan?.stores ?? [];

    // All occurrences of this store number (use allMatches if provided)
    const matches = (found.allMatches && found.allMatches.length > 0)
      ? found.allMatches
      : [found.store];

    // Build a sorted list of all stores for deterministic ordering by travée
    const sortKey = (t: string) => {
      // Numeric travées first, then alphanumeric
      const n = parseInt(t.replace(/\D/g, ""), 10);
      return isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
    };

    const sortedMatches = [...matches].sort((a, b) => {
      const ka = sortKey(a.travee);
      const kb = sortKey(b.travee);
      if (ka !== kb) return ka - kb;
      return a.travee.localeCompare(b.travee);
    });

    const total = sortedMatches.length;
    const primary = sortedMatches[0];
    const others = sortedMatches.slice(1).map((m, i) => ({
      travee: m.travee,
      zone: m.zone,
      position: i + 2,
    }));

    const r: SearchResult = {
      number: primary.number,
      travee: primary.travee,
      zone: primary.zone,
      name: found.name,
      position: 1,
      totalPositions: total,
      others,
    };

    setResult(r);
    setNotFound(false);
    announce(r);
  }, [announce, speak]);

  const handleSearchClick = () => runSearch(query);

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      speak("La reconnaissance vocale n'est pas disponible sur ce téléphone");
      return;
    }
    speak("Quel magasin cherchez-vous ?");

    // Wait briefly for the prompt to start, then listen
    setTimeout(() => {
      const rec = new SR();
      rec.lang = "fr-FR";
      rec.continuous = false;
      rec.interimResults = true;

      rec.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setQuery(text);
        if (event.results[0].isFinal) {
          const numbers = text.replace(/\s/g, "").match(/\d+/g);
          const q = numbers ? numbers.join("") : text.trim();
          runSearch(q);
          setListening(false);
        }
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);

      recognitionRef.current = rec;
      rec.start();
      setListening(true);
    }, 700);
  }, [runSearch, speak]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  // Headset/media key support — hardware play/pause triggers voice search
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "Recherche vocale STAF",
        artist: "Appuyez sur play pour parler",
      });
      const handler = () => {
        if (listening) stopListening();
        else startListening();
      };
      navigator.mediaSession.setActionHandler("play", handler);
      navigator.mediaSession.setActionHandler("pause", handler);
      // Keep session alive with a silent looping audio
      return () => {
        try {
          navigator.mediaSession.setActionHandler("play", null);
          navigator.mediaSession.setActionHandler("pause", null);
        } catch {}
      };
    } catch {}
  }, [listening, startListening, stopListening]);

  const clear = () => {
    setQuery("");
    setResult(null);
    setNotFound(false);
    inputRef.current?.focus();
  };

  return (
    <div className="min-h-screen bg-black flex flex-col text-white">
      <TruckLogo />
      <div className="flex items-center gap-3 p-4">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-gray-800" aria-label="Retour">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">Recherche</h1>
      </div>

      {/* Combined search bar */}
      <div className="px-4">
        <div className="flex items-center gap-2 bg-gray-900 border-2 border-gray-700 rounded-2xl p-2 focus-within:border-primary">
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearchClick()}
            placeholder="N° magasin ou nom..."
            className="flex-1 bg-transparent px-3 py-3 text-lg text-white outline-none"
          />
          {query && (
            <button onClick={clear} className="p-2 text-gray-400" aria-label="Effacer">
              <X size={20} />
            </button>
          )}
          <button
            onClick={handleSearchClick}
            className="bg-primary text-primary-foreground rounded-xl p-3"
            aria-label="Rechercher"
          >
            <SearchIcon size={22} />
          </button>
          <button
            onClick={listening ? stopListening : startListening}
            className={`rounded-xl p-3 ${listening ? "bg-red-600 animate-pulse" : "bg-green-600"}`}
            aria-label="Recherche vocale"
          >
            <Mic size={22} />
          </button>
        </div>
        {listening && (
          <p className="text-center text-red-400 mt-2 text-sm font-semibold">🎤 Parlez maintenant...</p>
        )}
      </div>

      {/* HUGE result display */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6">
        {result && (
          <div className="w-full text-center">
            {result.name && (
              <p className="text-2xl font-bold text-white/80 mb-3">{result.name}</p>
            )}
            <p className="text-xl text-gray-400 mb-1">Magasin</p>
            <p className="text-6xl font-black text-white mb-6">{result.number}</p>

            <div className="bg-gray-900 border-2 border-green-500 rounded-2xl py-6 px-4 mb-4">
              <p className="text-lg text-gray-400 mb-1">Travée</p>
              <p className="text-7xl font-black text-green-400 leading-none">{result.travee}</p>
              <p className="text-2xl font-bold text-blue-400 mt-3">{result.zone}</p>
            </div>

            {result.totalPositions && result.totalPositions > 1 && (
              <div className="bg-yellow-900/30 border border-yellow-500/50 rounded-xl p-3 mb-3">
                <p className="text-yellow-400 font-bold text-lg">
                  {ordinal(result.position!)} sur {result.totalPositions} dans le trajet
                </p>
              </div>
            )}

            {result.others && result.others.length > 0 && (
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 text-left">
                <p className="text-xs text-gray-400 mb-2 text-center">Autres positions :</p>
                {result.others.map((o, i) => (
                  <p key={i} className="text-base">
                    <span className="text-yellow-400 font-bold">{ordinal(o.position)}</span> →{" "}
                    Travée <span className="text-green-400 font-bold">{o.travee}</span> ({o.zone})
                  </p>
                ))}
              </div>
            )}

            <button
              onClick={() => announce(result)}
              className="mt-4 text-sm text-gray-400 underline"
            >
              🔊 Réécouter
            </button>
          </div>
        )}

        {notFound && (
          <div className="bg-red-900/30 border-2 border-red-500/50 rounded-2xl p-6 text-center">
            <p className="text-red-400 font-bold text-2xl">Magasin non trouvé</p>
            <p className="text-red-300 text-base mt-2">"{query}"</p>
          </div>
        )}

        {!result && !notFound && (
          <div className="text-center text-gray-500">
            <p className="text-base">Tapez un numéro ou nom de magasin,</p>
            <p className="text-base">ou appuyez sur 🎤 pour parler.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPage;
