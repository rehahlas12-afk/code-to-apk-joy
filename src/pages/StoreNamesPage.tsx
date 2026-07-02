import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Edit2, Check } from "lucide-react";
import { getStoreNames, addStoreName, removeStoreName, type StoreName } from "@/lib/store";
import TruckLogo from "@/components/TruckLogo";
import { toast } from "@/hooks/use-toast";

const StoreNamesPage = () => {
  const navigate = useNavigate();
  const [names, setNames] = useState<StoreName[]>(getStoreNames());
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

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

  return (
    <div className="min-h-screen bg-black flex flex-col text-white">
      <TruckLogo />
      <div className="flex items-center gap-3 p-4">
        <button onClick={() => navigate("/")} className="p-2 rounded-lg bg-gray-800">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">Noms des Magasins</h1>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-gray-900 border-2 border-white rounded-2xl p-4 space-y-4">
          <input
            type="text"
            inputMode="numeric"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="N° Magasin"
            className="w-full rounded-xl border-2 border-gray-600 bg-gray-800 px-4 py-4 text-3xl font-black text-white text-center placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom du Magasin"
            className="w-full rounded-xl border-2 border-gray-600 bg-gray-800 px-4 py-4 text-2xl font-bold text-white text-center placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-primary"
          />
          <button onClick={handleAdd} className="w-full bg-accent text-accent-foreground rounded-xl py-5 text-2xl font-black flex items-center justify-center gap-3">
            <Plus size={28} /> Ajouter magasin
          </button>
        </div>

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
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{item.name}</p>
                )}
              </div>
              <button onClick={() => handleEdit(idx)} className="p-2 text-primary">
                {editingIdx === idx ? <Check size={18} /> : <Edit2 size={18} />}
              </button>
              <button onClick={() => handleDelete(item.number)} className="p-2 text-destructive">
                <Trash2 size={18} />
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
