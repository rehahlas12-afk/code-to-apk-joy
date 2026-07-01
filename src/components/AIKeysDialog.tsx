import { useEffect, useState } from "react";
import { Key, X, Eye, EyeOff, ExternalLink, Save, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export type AiProviderId = "gemini_pro" | "gemini_flash" | "groq" | "deepseek";

export type AiKeys = {
  active: AiProviderId;
  gemini_pro: string;
  gemini_flash: string;
  groq: string;
  deepseek: string;
};

const DEFAULT_KEYS: AiKeys = {
  active: "gemini_flash",
  gemini_pro: "",
  gemini_flash: "",
  groq: "",
  deepseek: "",
};

const STORAGE_KEY = "staf_ai_keys";

export function loadAiKeys(): AiKeys {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // migration: ancienne clé groq
      const oldGroq = localStorage.getItem("staf_user_groq_key") || "";
      return { ...DEFAULT_KEYS, groq: oldGroq };
    }
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_KEYS, ...parsed };
  } catch {
    return DEFAULT_KEYS;
  }
}

export function saveAiKeys(keys: AiKeys) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(keys)); } catch {}
}

export function hasAnyKey(keys: AiKeys): boolean {
  return !!(keys.gemini_pro || keys.gemini_flash || keys.groq || keys.deepseek);
}

export function activeProviderLabel(keys: AiKeys): string {
  const p = PROVIDERS.find(p => p.id === keys.active);
  return p?.shortLabel ?? "Aucun";
}

type Provider = {
  id: AiProviderId;
  emoji: string;
  label: string;
  shortLabel: string;
  subtitle: string;
  placeholder: string;
  url: string;
  urlLabel: string;
};

const PROVIDERS: Provider[] = [
  { id: "gemini_pro",   emoji: "🧠", label: "Gemini 2.5 Pro",      shortLabel: "Gemini Pro",   subtitle: "Meilleure précision (payant)",   placeholder: "AIza...", url: "https://aistudio.google.com/apikey",     urlLabel: "aistudio.google.com" },
  { id: "gemini_flash", emoji: "🤖", label: "Gemini 2.5 Flash",    shortLabel: "Gemini Flash", subtitle: "Gratuit (tier quotidien)",       placeholder: "AIza...", url: "https://aistudio.google.com/apikey",     urlLabel: "aistudio.google.com" },
  { id: "groq",         emoji: "⚡", label: "Groq / Meta Llama",   shortLabel: "Groq",         subtitle: "Gratuit & très rapide (Llama 4)", placeholder: "gsk_...", url: "https://console.groq.com/keys",          urlLabel: "console.groq.com" },
  { id: "deepseek",     emoji: "🔍", label: "DeepSeek",            shortLabel: "DeepSeek",     subtitle: "Très économique (vision)",       placeholder: "sk-...",  url: "https://platform.deepseek.com/api_keys", urlLabel: "platform.deepseek.com" },
];

export default function AIKeysDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [keys, setKeys] = useState<AiKeys>(DEFAULT_KEYS);
  const [reveal, setReveal] = useState<Record<AiProviderId, boolean>>({ gemini_pro: false, gemini_flash: false, groq: false, deepseek: false });

  useEffect(() => { if (open) setKeys(loadAiKeys()); }, [open]);

  if (!open) return null;

  const setKey = (id: AiProviderId, value: string) => setKeys(k => ({ ...k, [id]: value }));
  const setActive = (id: AiProviderId) => setKeys(k => ({ ...k, active: id }));
  const clearKey = (id: AiProviderId) => setKeys(k => ({ ...k, [id]: "" }));

  const handleSave = () => {
    // s'assurer que l'actif a bien une clé, sinon prendre le premier avec une clé
    let next = keys;
    if (!keys[keys.active]) {
      const firstFilled = PROVIDERS.find(p => keys[p.id]);
      if (firstFilled) next = { ...keys, active: firstFilled.id };
    }
    saveAiKeys(next);
    toast({ title: "✅ Clés IA enregistrées", description: `Actif : ${activeProviderLabel(next)}` });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex flex-col" onClick={onClose}>
      <div className="flex-1 overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
        <div className="max-w-md mx-auto space-y-4 pb-24">
          <div className="flex items-center justify-between pt-2">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <Key size={22}/> Clés API – Intelligence Artificielle
            </h2>
            <button onClick={onClose} aria-label="Fermer" className="p-2 rounded-lg bg-gray-800 text-white"><X size={20}/></button>
          </div>

          <p className="text-sm text-gray-300">
            Quand le quota d'un fournisseur est épuisé, active un autre. Sélectionne le fournisseur actif avec le bouton radio.
          </p>

          {PROVIDERS.map(p => {
            const isActive = keys.active === p.id;
            const hasKey = !!keys[p.id];
            return (
              <div
                key={p.id}
                className={`rounded-2xl p-4 border-2 transition-colors ${isActive ? "border-blue-500 bg-gray-900" : "border-gray-700 bg-gray-900/60"}`}
              >
                <div className="flex items-start gap-3">
                  <div className="text-3xl leading-none">{p.emoji}</div>
                  <div className="flex-1">
                    <div className="text-white font-black text-lg leading-tight">{p.label}</div>
                    <div className="text-sm text-gray-400">{p.subtitle}</div>
                  </div>
                  <button
                    onClick={() => setActive(p.id)}
                    disabled={!hasKey && !isActive}
                    className={`px-3 py-2 rounded-full text-sm font-black whitespace-nowrap ${
                      isActive ? "bg-blue-600 text-white" : hasKey ? "bg-gray-700 text-gray-200" : "bg-gray-800 text-gray-500"
                    }`}
                  >
                    {isActive ? "✓ Actif" : "Activer"}
                  </button>
                </div>

                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-sm text-blue-400 underline"
                >
                  <ExternalLink size={14}/> Obtenir une clé : {p.urlLabel}
                </a>

                <div className={`mt-2 relative rounded-lg border ${isActive && hasKey ? "border-green-500" : "border-gray-700"} bg-gray-800`}>
                  <input
                    type={reveal[p.id] ? "text" : "password"}
                    value={keys[p.id]}
                    onChange={(e) => setKey(p.id, e.target.value)}
                    placeholder={p.placeholder}
                    className="w-full bg-transparent text-white text-base px-3 py-3 pr-10 font-mono outline-none"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    onClick={() => setReveal(r => ({ ...r, [p.id]: !r[p.id] }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400"
                    aria-label={reveal[p.id] ? "Masquer" : "Afficher"}
                  >
                    {reveal[p.id] ? <EyeOff size={18}/> : <Eye size={18}/>}
                  </button>
                </div>

                {hasKey && (
                  <button
                    onClick={() => clearKey(p.id)}
                    className="mt-2 inline-flex items-center gap-1 text-sm text-red-400 underline"
                  >
                    <Trash2 size={14}/> Supprimer la clé
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-3 border-t border-gray-800 bg-black" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={handleSave}
          className="w-full bg-yellow-500 text-black rounded-2xl p-4 flex items-center justify-center gap-2 font-black text-lg shadow-lg active:scale-95"
        >
          <Save size={22}/> Sauvegarder
        </button>
      </div>
    </div>
  );
}
