import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";
import { searchStore } from "@/lib/store";
import TruckLogo from "@/components/TruckLogo";

const TextSearchPage = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ number: string; travee: string; zone: string; name?: string; allMatches?: { number: string; travee: string; zone: string }[] } | null>(null);
  const [notFound, setNotFound] = useState(false);

  const handleSearch = () => {
    if (!query.trim()) return;
    const found = searchStore(query.trim());
    if (found) {
      setResult({ ...found.store, name: found.name, allMatches: found.allMatches });
      setNotFound(false);
    } else {
      setResult(null);
      setNotFound(true);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col text-white">
      <TruckLogo />
      <div className="flex items-center gap-3 p-4">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-gray-800">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">Recherche Clavier</h1>
      </div>

      <div className="p-4 flex flex-col gap-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="N° magasin ou nom..."
            className="flex-1 rounded-xl border border-gray-600 bg-gray-900 px-4 py-3 text-base text-white outline-none focus:ring-2 focus:ring-primary"
          />
          <button onClick={handleSearch} className="bg-primary text-primary-foreground rounded-xl px-5 py-3">
            <Search size={20} />
          </button>
        </div>

        {result && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 shadow-md space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">Magasin</span>
              <span className="font-bold text-lg">{result.number}</span>
            </div>
            {result.name && (
              <div className="flex justify-between">
                <span className="text-gray-400 text-sm">Nom</span>
                <span className="font-semibold">{result.name}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">Travée</span>
              <span className="font-bold text-lg text-green-400">{result.travee}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">Zone</span>
              <span className="font-semibold text-blue-400">{result.zone}</span>
            </div>
            {result.allMatches && result.allMatches.length > 1 && (
              <div className="border-t border-gray-700 pt-2 mt-2">
                <p className="text-xs text-gray-400 mb-1">Aussi trouvé dans :</p>
                {result.allMatches.slice(1).map((m, i) => (
                  <p key={i} className="text-sm">Travée <span className="text-green-400 font-bold">{m.travee}</span> - {m.zone}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {notFound && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4 text-center">
            <p className="text-red-400 font-semibold">Magasin non trouvé</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TextSearchPage;
