import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mic, Search as SearchIcon, X } from "lucide-react";
import { searchStore } from "@/lib/store";

interface MatchInfo {
  travee: string;
  zone: string;
  emplacement: number; // position in the travée (1, 2, 3)
  totalInTravee: number;
}

interface SearchResult {
  number: string;
  name?: string;
  matches: MatchInfo[];
}

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
    r.matches.forEach((m, idx) => {
      if (idx === 0) {
        msg += `, se trouve sur la travée ${m.travee}`;
      } else {
        msg += `, et aussi sur la travée ${m.travee}`;
      }
      if (m.totalInTravee > 1) {
        msg += `, ${m.emplacement}${m.emplacement === 1 ? "er" : "ème"} emplacement`;
      }
      if (m.zone && m.zone !== "Zone 1") {
        msg += `, ${m.zone}`;
      }
    });
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

    const matches = (found.allMatches && found.allMatches.length > 0)
      ? found.allMatches
      : [found.store];

    // Sort by travée number, then alphabetically
    const sortKey = (t: string) => {
      const n = parseInt(t.replace(/\D/g, ""), 10);
      return isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
    };
    const sorted = [...matches].sort((a, b) => {
      const ka = sortKey(a.travee);
      const kb = sortKey(b.travee);
      if (ka !== kb) return ka - kb;
      return a.travee.localeCompare(b.travee);
    });

    // For each match, compute its emplacement WITHIN its travée
    // We need the full store list of that travée to know position
    // We can reuse searchStore globally via a quick scan
    const computed: MatchInfo[] = sorted.map((m) => {
      // All stores in same travée+zone (from result perspective: we only know this store appears there)
      // We need to find ALL stores in that travée. Use the global store list.
      const allInTravee = (window as any).__stafAllInTravee?.(m.travee, m.zone) ?? [];
      const totalInTravee = allInTravee.length || 1;
      let emplacement = allInTravee.findIndex((s: any) => s.number === m.number);
      if (emplacement < 0) emplacement = 0;
      return {
        travee: m.travee,
        zone: m.zone,
        emplacement: emplacement + 1,
        totalInTravee,
      };
    });

    const r: SearchResult = {
      number: sorted[0].number,
      name: found.name,
      matches: computed,
    };

    setResult(r);
    setNotFound(false);
    announce(r);
  }, [announce, speak]);

  // Expose helper to compute travée occupancy
  useEffect(() => {
    import("@/lib/store").then(({ getStores }) => {
      (window as any).__stafAllInTravee = (travee: string, zone: string) => {
        return getStores().filter((s) => s.travee === travee && s.zone === zone);
      };
    });
  }, []);

  const handleSearchClick = () => runSearch(query);

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      speak("La reconnaissance vocale n'est pas disponible sur ce téléphone");
      return;
    }
    speak("Quel magasin cherchez-vous ?");

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
    <div className="h-screen bg-black flex flex-col text-white overflow-hidden">
      {/* Compact header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-black border-b border-gray-800">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-gray-800" aria-label="Retour">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-bold">Recherche</h1>
      </div>

      {/* Compact search bar — pushed to give room for mic */}
      <div className="px-2 pt-2">
        <div className="flex items-center gap-1 bg-gray-900 border-2 border-gray-700 rounded-xl p-1 focus-within:border-primary">
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearchClick()}
            placeholder="N° magasin..."
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-base text-white outline-none"
          />
          {query && (
            <button onClick={clear} className="p-1.5 text-gray-400 shrink-0" aria-label="Effacer">
              <X size={18} />
            </button>
          )}
          <button
            onClick={handleSearchClick}
            className="bg-primary text-primary-foreground rounded-lg p-2 shrink-0"
            aria-label="Rechercher"
          >
            <SearchIcon size={20} />
          </button>
          <button
            onClick={listening ? stopListening : startListening}
            className={`rounded-lg p-2 shrink-0 ${listening ? "bg-red-600 animate-pulse" : "bg-green-600"}`}
            aria-label="Recherche vocale"
          >
            <Mic size={20} />
          </button>
        </div>
        {listening && (
          <p className="text-center text-red-400 mt-1 text-xs font-semibold">🎤 Parlez maintenant...</p>
        )}
      </div>

      {/* HUGE result display — scrollable, takes maximum space */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {result && (
          <div className="w-full text-center">
            {result.name && (
              <p className="text-xl font-bold text-white/80 mb-1">{result.name}</p>
            )}
            <p className="text-5xl font-black text-white mb-2">N° {result.number}</p>

            <div className="space-y-2">
              {result.matches.map((m, i) => (
                <div
                  key={i}
                  className="bg-gray-900 border-2 border-green-500 rounded-2xl py-3 px-3"
                >
                  <p className="text-sm text-gray-400">Travée</p>
                  <p className="text-7xl font-black text-green-400 leading-none">{m.travee}</p>
                  {m.totalInTravee > 1 ? (
                    <p className="text-2xl font-bold text-yellow-400 mt-2">
                      {m.emplacement}{m.emplacement === 1 ? "er" : "ème"} emplacement
                      <span className="text-base text-gray-400"> / {m.totalInTravee}</span>
                    </p>
                  ) : (
                    <p className="text-base text-gray-500 mt-1">seul magasin</p>
                  )}
                  {m.zone && m.zone !== "Zone 1" && (
                    <p className="text-lg font-bold text-blue-400 mt-1">{m.zone}</p>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => announce(result)}
              className="mt-3 text-sm text-gray-400 underline"
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
          <div className="text-center text-gray-500 mt-8">
            <p className="text-base">Tapez un numéro ou nom de magasin,</p>
            <p className="text-base">ou appuyez sur 🎤 pour parler.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPage;
