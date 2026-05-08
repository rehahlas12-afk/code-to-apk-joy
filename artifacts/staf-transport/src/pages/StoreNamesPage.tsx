import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Edit2, Check, Upload, Download } from "lucide-react";
import { getStoreNames, addStoreName, removeStoreName, setStoreNames, type StoreName } from "@/lib/store";
import TruckLogo from "@/components/TruckLogo";
import { toast } from "@/hooks/use-toast";

const StoreNamesPage = () => {
  const navigate = useNavigate();
  const [names, setNames] = useState<StoreName[]>(getStoreNames());
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    if (!number.trim() || !name.trim()) return;
    addStoreName(number.trim(), name.trim());
    setNames(getStoreNames());
    setNumber("");
    setName("");
    toast({ title: "Nom ajouté" });
  };

  const handleDelete = (num: string) => {
    removeStoreName(num);
    setNames(getStoreNames());
    toast({ title: "Nom supprimé" });
  };

  const handleEdit = (idx: number) => {
    if (editingIdx === idx) {
      addStoreName(names[idx].number, editName);
      setNames(getStoreNames());
      setEditingIdx(null);
      toast({ title: "Nom modifié" });
    } else {
      setEditingIdx(idx);
      setEditName(names[idx].name);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const raw = JSON.parse(text);

      // Normalize to array — handle wrapped formats
      let arr: any[] = [];
      if (Array.isArray(raw)) {
        arr = raw;
      } else if (raw && typeof raw === "object") {
        // Try common wrapper keys
        const wrapKey = ["storeNames","store_names","names","stores","magasins","data"].find(k => Array.isArray(raw[k]));
        if (wrapKey) arr = raw[wrapKey];
        else throw new Error("Format non reconnu");
      }

      // Normalize each entry — handle various field name styles
      const valid: StoreName[] = [];
      for (const item of arr) {
        if (!item || typeof item !== "object") continue;
        const num = String(
          item.number ?? item.storeNumber ?? item.store_number ??
          item.num ?? item.numero ?? item.magasin ?? ""
        ).trim();
        const name = String(
          item.name ?? item.storeName ?? item.store_name ??
          item.nom ?? item.label ?? item.ville ?? ""
        ).trim();
        if (num && name) valid.push({ number: num, name });
      }

      if (valid.length === 0) {
        toast({ title: "⚠️ Aucun magasin trouvé dans le fichier", description: "Vérifie que le fichier vient bien de l'app Noms Magasins", variant: "destructive" });
        return;
      }

      const existing = getStoreNames();
      const map = new Map(existing.map(n => [n.number, n.name]));
      valid.forEach(n => map.set(n.number, n.name));
      const merged = Array.from(map.entries()).map(([number, name]) => ({ number, name }));
      setStoreNames(merged);
      setNames(getStoreNames());
      toast({ title: `✅ ${valid.length} noms importés`, description: `Total : ${merged.length} magasins enregistrés` });
    } catch (err) {
      console.error("Import error:", err);
      toast({ title: "❌ Fichier invalide", description: "Le fichier doit être un JSON exporté depuis l'app", variant: "destructive" });
    } finally {
      e.target.value = "";
    }
  };

  const handleExport = () => {
    const current = getStoreNames();
    if (current.length === 0) { toast({ title: "Aucun nom à exporter" }); return; }
    const blob = new Blob([JSON.stringify(current, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `staf-noms-magasins-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `✅ ${current.length} noms exportés` });
  };

  return (
    <div className="min-h-screen bg-black flex flex-col text-white">
      <TruckLogo />
      <div className="flex items-center gap-3 p-4">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-gray-800">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">Noms des Magasins</h1>
        <div className="flex-1" />
        <button onClick={() => fileInputRef.current?.click()} className="bg-purple-600 text-white rounded-lg px-3 py-2 flex items-center gap-2 text-sm font-bold">
          <Upload size={16} /> Importer
        </button>
        <button onClick={handleExport} className="bg-purple-700 text-white rounded-lg px-3 py-2 flex items-center gap-2 text-sm font-bold">
          <Download size={16} /> Exporter
        </button>
        <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
          <input
            type="text"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="N° Magasin"
            className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-base text-white outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom du Magasin"
            className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-base text-white outline-none focus:ring-2 focus:ring-primary"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <button onClick={handleAdd} className="w-full bg-accent text-accent-foreground rounded-lg py-3 font-bold flex items-center justify-center gap-2">
            <Plus size={18} /> Ajouter
          </button>
        </div>

        {names.length > 0 && (
          <p className="text-xs text-gray-400 text-center">{names.length} magasins enregistrés</p>
        )}

        <div className="space-y-2">
          {names.map((item, idx) => (
            <div key={item.number} className="bg-gray-900 border border-gray-700 rounded-xl p-3 flex items-center gap-3">
              <div className="flex-1">
                <p className="font-bold">{item.number}</p>
                {editingIdx === idx ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded border bg-background px-2 py-1 text-sm mt-1"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleEdit(idx)}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{item.name}</p>
                )}
              </div>
              <button onClick={() => handleEdit(idx)} className="p-2 text-primary">
                {editingIdx === idx ? <Check size={18} /> : <Edit2 size={18} />}
              </button>
              <button onClick={() => handleDelete(item.number)} className="p-2 text-destructive">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {names.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-4">Aucun nom enregistré</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default StoreNamesPage;
