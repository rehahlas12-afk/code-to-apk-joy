import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mic, Search as SearchIcon, X } from "lucide-react";
import { searchStore, searchStoreFuzzy, suggestStores, searchByTravee, getSearchableStores, type StoreSuggestion, type TraveeResult } from "@/lib/store";

interface MatchInfo {
  travee: string;
  zone: string;
  emplacement: number;
  totalInTravee: number;
}

interface SearchResult {
  number: string;
  name?: string;
  matches: MatchInfo[];
}

// Speak the zone like a human: "en débord", "kraft", or nothing for Zone 1
const zonePhrase = (zone: string): string => {
  const z = (zone || "").toLowerCase();
  if (z.includes("deb") || z.includes("déb")) return "en débord";
  if (z.includes("craft") || z.includes("kraft")) return "kraft";
  return "";
};

const SearchPage = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [listening, setListening] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
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

  const computeResult = useCallback((number: string, name?: string): SearchResult => {
    const stores = getSearchableStores();
    const all = stores.filter(s => s.number === number);
    const sortKey = (t: string) => {
      const n = parseInt(t.replace(/\D/g, ""), 10);
      return isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
    };
    const sorted = [...all].sort((a, b) => sortKey(a.travee) - sortKey(b.travee) || a.travee.localeCompare(b.travee));
    const matches: MatchInfo[] = sorted.map((m) => {
      const allInTravee = stores.filter((s) => s.travee === m.travee && s.zone === m.zone);
      let emp = allInTravee.findIndex((s) => s.number === m.number);
      if (emp < 0) emp = 0;
      return {
        travee: m.travee,
        zone: m.zone,
        emplacement: emp + 1,
        totalInTravee: allInTravee.length || 1,
      };
    });
    return { number, name, matches };
  }, []);

  const announce = useCallback((r: SearchResult) => {
    let msg = `Magasin ${r.number}`;
    if (r.name) msg += `, ${r.name}`;
    r.matches.forEach((m, idx) => {
      const zp = zonePhrase(m.zone);
      const traveeRead = zp ? `${m.travee} ${zp}` : `${m.travee}`;
      msg += idx === 0
        ? `, travée ${traveeRead}`
        : `, et aussi travée ${traveeRead}`;
      if (m.totalInTravee > 1) {
        msg += `, ${m.emplacement}${m.emplacement === 1 ? "er" : "ème"} emplacement`;
      }
    });
    speak(msg);
  }, [speak]);

  const runSearch = useCallback((q: string, fuzzy = false) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setShowSuggestions(false);

    const found = fuzzy ? searchStoreFuzzy(trimmed) : searchStore(trimmed);
    if (!found) {
      setResult(null);
      setNotFound(true);
      speak(`Magasin ${trimmed} non trouvé`);
      return;
    }
    const r = computeResult(found.store.number, found.name);
    setResult(r);
    setNotFound(false);
    announce(r);
  }, [announce, computeResult, speak]);

  const selectSuggestion = useCallback((s: StoreSuggestion) => {
    setQuery(s.name || s.number);
    setShowSuggestions(false);
    const r = computeResult(s.number, s.name);
    setResult(r);
    setNotFound(false);
    announce(r);
  }, [announce, computeResult]);

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      speak("La reconnaissance vocale n'est pas disponible");
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
          const q = numbers && numbers.join("").length >= 3 ? numbers.join("") : text.trim();
          runSearch(q, true); // fuzzy/phonetic OK pour la voix
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
        title: "Recherche STAF",
        artist: "Appuyez sur play pour parler",
      });
      const handler = () => { if (listening) stopListening(); else startListening(); };
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
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  // Live suggestions while typing (filter by first letters)
  const suggestions = useMemo<StoreSuggestion[]>(() => {
    if (!query.trim()) return [];
    return suggestStores(query, 40);
  }, [query]);

  return (
    <div className="h-screen bg-black flex flex-col text-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-black border-b border-gray-800">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-gray-800" aria-label="Retour">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-bold">Recherche</h1>
      </div>

      {/* Search bar — WHITE outline */}
      <div className="px-2 pt-2 relative">
        <div className="flex items-center gap-1 bg-gray-900 border-2 border-white rounded-xl p-1 focus-within:border-white">
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={(e) => e.key === "Enter" && runSearch(query)}
            placeholder="N° ou nom magasin..."
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-base text-white outline-none"
          />
          {query && (
            <button onClick={clear} className="p-1.5 text-gray-400 shrink-0" aria-label="Effacer">
              <X size={18} />
            </button>
          )}
          <button
            onClick={() => runSearch(query)}
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

        {/* Autocomplete dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-2 right-2 top-full mt-1 z-30 bg-gray-900 border-2 border-white rounded-xl max-h-64 overflow-y-auto shadow-2xl">
            {suggestions.map((s) => (
              <button
                key={s.number}
                onClick={() => selectSuggestion(s)}
                className="w-full text-left px-3 py-2 border-b border-gray-800 hover:bg-gray-800 active:bg-gray-700 flex items-center justify-between gap-2"
              >
                <span className="font-bold text-white text-base truncate">
                  {s.name ? s.name : `Magasin ${s.number}`}
                </span>
                <span className="text-sm font-bold text-green-400 shrink-0">N° {s.number}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Result display */}
      <div className="flex-1 overflow-y-auto px-2 py-2" onClick={() => setShowSuggestions(false)}>
        {result && (
          <div className="w-full text-center">
            {result.name && (
              <p className="text-xl font-bold text-white/80 mb-1">{result.name}</p>
            )}
            <p className="text-5xl font-black text-white mb-2">N° {result.number}</p>

            <div className="space-y-2">
              {result.matches.map((m, i) => {
                const zp = zonePhrase(m.zone);
                return (
                  <div key={i} className="bg-gray-900 border-2 border-green-500 rounded-2xl py-3 px-3">
                    <p className="text-sm text-gray-400">Travée</p>
                    <p className="text-7xl font-black text-green-400 leading-none">{m.travee}</p>
                    {zp && (
                      <p className="text-xl font-bold text-blue-400 mt-1 uppercase">{zp}</p>
                    )}
                    {m.totalInTravee > 1 ? (
                      <p className="text-2xl font-bold text-yellow-400 mt-2">
                        {m.emplacement}{m.emplacement === 1 ? "er" : "ème"} emplacement
                        <span className="text-base text-gray-400"> / {m.totalInTravee}</span>
                      </p>
                    ) : (
                      <p className="text-base text-gray-500 mt-1">seul magasin</p>
                    )}
                  </div>
                );
              })}
            </div>

            <button onClick={() => announce(result)} className="mt-3 text-sm text-gray-400 underline">
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

        {!result && !notFound && !showSuggestions && (
          <div className="text-center text-gray-500 mt-8">
            {getSearchableStores().length === 0 ? (
              <p className="text-xl font-bold">Il n'y a pas de plan de travail.</p>
            ) : (
              <>
                <p className="text-base">Tapez les premières lettres,</p>
                <p className="text-base">ou appuyez sur 🎤 pour parler.</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPage;
