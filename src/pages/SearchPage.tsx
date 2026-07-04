import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mic, Search as SearchIcon, X, Copy } from "lucide-react";
import { searchStore, searchStoreFuzzy, suggestStores, searchByTravee, getSearchableStores, getStoreNames, type StoreSuggestion, type TraveeResult } from "@/lib/store";
import { speakFr } from "@/lib/speech";
import { startVoice, type VoiceHandle } from "@/lib/voiceInput";

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

// Speak the zone like a human: "en débord 3", "kraft", or nothing for Zone 1
// Lettres seules (X, Y, Z…) ne sont JAMAIS en débord — toujours Zone 1.
const zonePhrase = (zone: string, travee?: string): string => {
  if (travee && /^[A-Za-z]$/.test(travee.trim())) return "";
  const z = (zone || "").toLowerCase();
  if (z.includes("deb") || z.includes("déb")) {
    const m = (travee || "").toUpperCase().match(/DEB\s*(\d+)/);
    if (m) return `en débord ${m[1]}`;
    return "en débord";
  }
  if (z.includes("craft") || z.includes("kraft")) return "kraft";
  return "";
};

// Affichage : conserver la forme du plan (DEB1, DEB2, …)
const traveeLabel = (t: string): string => (t || "").toUpperCase();

// Insère un espace entre chiffres et lettres pour que la TTS prononce bien "306 X"
const traveeSpoken = (t: string) => t.replace(/(\d)([A-Za-z])/g, "$1 $2").replace(/([A-Za-z])(\d)/g, "$1 $2");

// Petit bip court (remplace le message "Quel magasin cherchez-vous ?")
const beep = () => {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    void ctx.resume?.();
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1500;
    osc.type = "square";
    osc2.frequency.value = 900;
    osc2.type = "sine";
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.34);
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc2.start();
    setTimeout(() => { try { osc.stop(); osc2.stop(); ctx.close(); } catch {} }, 360);
  } catch {}
};

const SearchPage = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [traveeQuery, setTraveeQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [traveeResults, setTraveeResults] = useState<TraveeResult[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [listening, setListening] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const recognitionRef = useRef<VoiceHandle | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listeningTimeoutRef = useRef<number | null>(null);

  const endListening = useCallback(() => {
    if (listeningTimeoutRef.current) {
      window.clearTimeout(listeningTimeoutRef.current);
      listeningTimeoutRef.current = null;
    }
    setListening(false);
    recognitionRef.current = null;
  }, []);

  const speak = useCallback((text: string) => {
    void speakFr(text);
  }, []);

  const computeResult = useCallback((number: string, name?: string): SearchResult => {
    const stores = getSearchableStores();
    const all = stores.filter(s => s.number === number);
    const zoneOrder = (z: string) => {
      const n = (z || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      if (n.includes("craft") || n.includes("kraft")) return 2;
      if (n.includes("debord") || n.includes("deb")) return 1;
      return 0;
    };
    const sortKey = (t: string) => {
      const n = parseInt(t.replace(/\D/g, ""), 10);
      return isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
    };
    const sorted = [...all].sort((a, b) => zoneOrder(a.zone) - zoneOrder(b.zone) || sortKey(a.travee) - sortKey(b.travee) || a.travee.localeCompare(b.travee));
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
      const zp = zonePhrase(m.zone, m.travee);
      const traveeRead = zp ? `${traveeSpoken(m.travee)} ${zp}` : `${traveeSpoken(m.travee)}`;
      msg += idx === 0
        ? `, travée ${traveeRead}`
        : `, et aussi travée ${traveeRead}`;
      if (m.totalInTravee > 1) {
        msg += `, ${m.emplacement}${m.emplacement === 1 ? "er" : "ème"} emplacement`;
      }
    });
    speak(msg);
  }, [speak]);

  const announceTravee = useCallback((results: TraveeResult[], travee: string) => {
    const total = results.reduce((s, g) => s + g.stores.length, 0);
    let msg = `Travée ${traveeSpoken(travee)}, ${total} magasin${total > 1 ? "s" : ""}`;
    results.forEach((g) => {
      const zp = zonePhrase(g.zone, g.travee);
      if (zp) msg += `, ${zp}`;
      g.stores.forEach((st) => {
        msg += `, ${st.name ? st.name : "magasin " + st.number}`;
      });
    });
    speak(msg);
  }, [speak]);

  const runSearch = useCallback((q: string, fuzzy = false) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setShowSuggestions(false);

    const found = fuzzy ? searchStoreFuzzy(trimmed) : searchStore(trimmed);
    if (found) {
      const r = computeResult(found.store.number, found.name);
      setResult(r);
      setTraveeResults(null);
      setNotFound(false);
      announce(r);
      return;
    }

    // Fallback : peut-être un numéro de travée
    const tr = searchByTravee(trimmed);
    if (tr.length > 0) {
      setResult(null);
      setTraveeResults(tr);
      setNotFound(false);
      announceTravee(tr, trimmed);
      return;
    }

    setResult(null);
    setTraveeResults(null);
    setNotFound(true);
    speak(`${trimmed} non trouvé`);
  }, [announce, announceTravee, computeResult, speak]);

  const runTraveeSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setShowSuggestions(false);
    const tr = searchByTravee(trimmed);
    if (tr.length > 0) {
      setResult(null);
      setTraveeResults(tr);
      setNotFound(false);
      announceTravee(tr, trimmed);
      return;
    }
    setResult(null);
    setTraveeResults(null);
    setNotFound(true);
    speak(`Travée ${traveeSpoken(trimmed)} non trouvée`);
  }, [announceTravee, speak]);

  const selectSuggestion = useCallback((s: StoreSuggestion) => {
    setQuery(s.name || s.number);
    setShowSuggestions(false);
    const r = computeResult(s.number, s.name);
    setResult(r);
    setTraveeResults(null);
    setNotFound(false);
    announce(r);
  }, [announce, computeResult]);

  const startListening = useCallback(async () => {
    try { await recognitionRef.current?.stop(); } catch {}
    beep();
    window.speechSynthesis?.cancel?.();
    setListening(true);
    listeningTimeoutRef.current = window.setTimeout(() => {
      void recognitionRef.current?.stop();
      endListening();
    }, 9000);
    const handle = await startVoice({
      onPartial: (text) => { setQuery(text); setShowSuggestions(true); },
      onFinal: (text) => {
        setQuery(text);
        setShowSuggestions(true);
        const numbers = text.replace(/\s/g, "").match(/\d+/g);
        const q = numbers && numbers.join("").length >= 3 ? numbers.join("") : text.trim();
        runSearch(q, true);
        endListening();
      },
      onError: () => endListening(),
      onEnd: () => endListening(),
    });
    recognitionRef.current = handle;
    if (!handle) endListening();
  }, [endListening, runSearch]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    endListening();
  }, [endListening]);

  const startTraveeListening = useCallback(async () => {
    try { await recognitionRef.current?.stop(); } catch {}
    beep();
    window.speechSynthesis?.cancel?.();
    setListening(true);
    listeningTimeoutRef.current = window.setTimeout(() => {
      void recognitionRef.current?.stop();
      endListening();
    }, 9000);
    const handle = await startVoice({
      onPartial: (text) => setTraveeQuery(text.toUpperCase()),
      onFinal: (text) => {
        const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
        setTraveeQuery(cleaned || text.trim().toUpperCase());
        runTraveeSearch(cleaned || text.trim());
        endListening();
      },
      onError: () => endListening(),
      onEnd: () => endListening(),
    });
    recognitionRef.current = handle;
    if (!handle) endListening();
  }, [endListening, runTraveeSearch]);


  // Auto-déclenche la voix si on arrive avec ?voice=1 (depuis bouton casque global)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("voice") === "1") {
      const t = setTimeout(() => startListening(), 300);
      return () => clearTimeout(t);
    }
  }, [startListening]);

  const clear = () => {
    setQuery("");
    setResult(null);
    setTraveeResults(null);
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

      {/* Dedicated travée search bar — ORANGE outline */}
      <div className="px-2 pt-2">
        <div className="flex items-center gap-1 bg-gray-900 border-2 border-orange-500 rounded-xl p-1">
          <span className="text-orange-400 font-black text-sm pl-2 shrink-0">TRAVÉE</span>
          <input
            type="text"
            inputMode="text"
            value={traveeQuery}
            onChange={(e) => setTraveeQuery(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && runTraveeSearch(traveeQuery)}
            placeholder="N° ou lettre (ex: 306, X)"
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-base text-white outline-none uppercase"
          />
          {traveeQuery && (
            <button onClick={() => setTraveeQuery("")} className="p-1.5 text-gray-400 shrink-0" aria-label="Effacer">
              <X size={18} />
            </button>
          )}
          <button
            onClick={() => runTraveeSearch(traveeQuery)}
            className="bg-orange-600 text-white rounded-lg p-2 shrink-0"
            aria-label="Rechercher travée"
          >
            <SearchIcon size={20} />
          </button>
          <button
            onClick={listening ? stopListening : startTraveeListening}
            className={`rounded-lg p-2 shrink-0 ${listening ? "bg-red-600 animate-pulse" : "bg-green-600"}`}
            aria-label="Recherche vocale travée"
          >
            <Mic size={20} />
          </button>
        </div>
      </div>

      {/* Duplicates button */}
      <div className="px-2 pt-2">
        <button
          onClick={() => setShowDuplicates(true)}
          className="w-full flex items-center justify-center gap-2 bg-yellow-500 text-black font-black text-lg py-3 rounded-xl border-2 border-yellow-300 active:bg-yellow-600"
        >
          <Copy size={22} /> MAGASINS EN DOUBLE
        </button>
      </div>



      {/* Result display */}
      <div className="flex-1 overflow-y-auto px-2 py-2" onClick={() => setShowSuggestions(false)}>
        {result && (
          <div className="w-full text-center">
            {result.name ? (
              <p className="text-5xl font-black text-white leading-tight mb-2 break-words">{result.name}</p>
            ) : (
              <p className="text-5xl font-black text-white mb-2">Magasin</p>
            )}
            <p className="text-2xl font-bold text-white/90 mb-3">N° {result.number}</p>

            <div className="space-y-2">
              {result.matches.map((m, i) => {
                const zp = zonePhrase(m.zone, m.travee);
                return (
                  <div key={i} className="bg-gray-900 border-2 border-green-500 rounded-2xl py-3 px-3">
                    <p className="text-sm text-gray-400">Travée</p>
                    <p className="text-7xl font-black text-green-400 leading-none">{traveeLabel(m.travee)}</p>
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

        {traveeResults && traveeResults.map((g, i) => {
          const zp = zonePhrase(g.zone, g.travee);
          return (
            <div key={i} className="bg-gray-900 border-2 border-orange-500 rounded-2xl p-3 mb-3">
              <p className="text-base text-gray-400 text-center">Travée</p>
              <p className="text-7xl font-black text-orange-400 leading-none text-center break-words">{traveeLabel(g.travee)}</p>
              {zp && <p className="text-2xl font-bold text-blue-400 mt-2 uppercase text-center">{zp}</p>}
              <p className="text-lg text-gray-300 text-center mt-3 font-bold">{g.stores.length} magasin{g.stores.length > 1 ? "s" : ""}</p>
              <div className="mt-3 space-y-3">
                {g.stores.map((st) => (
                  <div key={st.number} className="bg-gray-800 border-2 border-gray-700 rounded-2xl px-3 py-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-7xl font-black text-yellow-400 leading-none shrink-0">{st.emplacement}</span>
                      <span className="text-base text-gray-400 font-bold">emplacement</span>
                    </div>
                    {st.name ? (
                      <p className="text-4xl font-black text-white leading-tight break-words">{st.name}</p>
                    ) : (
                      <p className="text-4xl font-black text-white leading-tight">Magasin</p>
                    )}
                    <p className="text-xl font-bold text-white/90 mt-2">N° {st.number}</p>
                  </div>
                ))}
              </div>
              <button onClick={() => announceTravee([g], g.travee)} className="mt-3 text-sm text-gray-400 underline block mx-auto">
                🔊 Réécouter
              </button>
            </div>
          );
        })}

        {notFound && (
          <div className="bg-red-900/30 border-2 border-red-500/50 rounded-2xl p-6 text-center">
            <p className="text-red-400 font-bold text-2xl">Non trouvé</p>
            <p className="text-red-300 text-base mt-2">"{query}"</p>
          </div>
        )}

        {!result && !traveeResults && !notFound && !showSuggestions && (
          <div className="text-center text-gray-500 mt-8">
            {getSearchableStores().length === 0 ? (
              <p className="text-xl font-bold">Il n'y a pas de plan de travail.</p>
            ) : (
              <>
                <p className="text-base">Tapez les premières lettres,</p>
                <p className="text-base">ou appuyez sur 🎤 pour parler.</p>
                <p className="text-xs mt-2 text-gray-600">Vous pouvez aussi taper un n° de travée (ex: 306).</p>
              </>
            )}
          </div>
        )}
      </div>

      {showDuplicates && <DuplicatesModal onClose={() => setShowDuplicates(false)} />}
    </div>
  );
};

// ---- Duplicates modal ------------------------------------------------------
const DuplicatesModal = ({ onClose }: { onClose: () => void }) => {
  const stores = getSearchableStores();
  const names = getStoreNames();
  const nameOf = (num: string) => names.find((n) => n.number === num)?.name;
  const zoneOrder = (z: string) => {
    const n = (z || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (n.includes("craft") || n.includes("kraft")) return 2;
    if (n.includes("debord") || n.includes("deb")) return 1;
    return 0;
  };
  const traveeOrder = (t: string) => {
    const n = parseInt(String(t || "").replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  };

  // Group by number, keep those with >1 location
  const groups = useMemo(() => {
    const map = new Map<string, { travee: string; zone: string }[]>();
    for (const s of stores) {
      if (!map.has(s.number)) map.set(s.number, []);
      map.get(s.number)!.push({ travee: s.travee, zone: s.zone });
    }
    const out: { number: string; name?: string; locations: { travee: string; zone: string }[] }[] = [];
    for (const [num, locs] of map) {
      if (locs.length > 1) {
        out.push({
          number: num,
          name: nameOf(num),
          locations: [...locs].sort((a, b) => zoneOrder(a.zone) - zoneOrder(b.zone) || traveeOrder(a.travee) - traveeOrder(b.travee) || a.travee.localeCompare(b.travee)),
        });
      }
    }
    out.sort((a, b) => b.locations.length - a.locations.length || a.number.localeCompare(b.number));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col text-white">
      <div className="flex items-center gap-2 px-3 py-2 bg-black border-b border-gray-800">
        <button onClick={onClose} className="p-2 rounded-lg bg-gray-800" aria-label="Fermer">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-black flex-1">Magasins en double ({groups.length})</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {groups.length === 0 ? (
          <p className="text-center text-gray-400 mt-10 text-lg font-bold">Aucun magasin en double.</p>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => {
              const maxPlaces = g.locations.length;
              const cellW = `${100 / maxPlaces}%`;
              return (
                <div key={g.number} className="bg-gray-900 border-2 border-yellow-500 rounded-xl overflow-hidden">
                  {/* Left header : magasin */}
                  <div className="m-2 border-4 border-yellow-400 rounded-lg px-2 py-2 bg-black text-center">
                    {g.name && <p className="text-lg font-black leading-tight truncate text-white">{g.name}</p>}
                    <p className="text-3xl font-black leading-none text-white">N° {g.number}</p>
                  </div>
                  <table className="w-full table-fixed">
                    <thead>
                      <tr className="bg-gray-800 text-yellow-300 text-xs font-black">
                        {g.locations.map((_, i) => (
                          <th key={i} className="py-1 border-r border-black last:border-r-0" style={{ width: cellW }}>
                            PLACE {i + 1}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="text-center">
                        {g.locations.map((loc, i) => (
                          <td key={i} className="py-2 border-r border-gray-700 last:border-r-0 align-middle">
                            <p className="text-2xl font-black text-green-400 leading-none">{(loc.travee || "").toUpperCase()}</p>
                            {loc.zone && loc.zone !== "Zone 1" && (
                              <p className="text-[10px] font-bold text-blue-300 mt-1 uppercase">{loc.zone}</p>
                            )}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchPage;
