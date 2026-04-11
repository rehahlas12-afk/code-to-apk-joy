import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";
import { searchStore } from "@/lib/store";
import TruckLogo from "@/components/TruckLogo";

const TextSearchPage = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ number: string; travee: string; zone: string; name?: string } | null>(null);
  const [notFound, setNotFound] = useState(false);

  const handleSearch = () => {
    if (!query.trim()) return;
    const found = searchStore(query.trim());
    if (found) {
      setResult({ ...found.store, name: found.name });
      setNotFound(false);
    } else {
      setResult(null);
      setNotFound(true);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TruckLogo />
      <div className="flex items-center gap-3 p-4">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-muted">
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
            className="flex-1 rounded-xl border bg-card px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring"
          />
          <button onClick={handleSearch} className="bg-primary text-primary-foreground rounded-xl px-5 py-3">
            <Search size={20} />
          </button>
        </div>

        {result && (
          <div className="bg-card border rounded-xl p-5 shadow-md space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Magasin</span>
              <span className="font-bold text-lg">{result.number}</span>
            </div>
            {result.name && (
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Nom</span>
                <span className="font-semibold">{result.name}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Travée</span>
              <span className="font-bold text-lg text-primary">{result.travee}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Zone</span>
              <span className="font-semibold text-accent">{result.zone}</span>
            </div>
          </div>
        )}

        {notFound && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-center">
            <p className="text-destructive font-semibold">Magasin non trouvé</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TextSearchPage;
