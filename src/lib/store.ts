// Local storage-based data store for offline functionality

export interface StoreData {
  number: string;
  travee: string;
  zone: string;
}

export interface StoreName {
  number: string;
  name: string;
}

export interface PlanRecord {
  id: string;
  imageData: string;
  stores: StoreData[];
  date: string;
  time: string;
}

const STORES_KEY = 'staf_stores';
const NAMES_KEY = 'staf_names';
const PLANS_KEY = 'staf_plans';
const ACTIVE_PLAN_KEY = 'staf_active_plan_id';

const DEMO_STORES: StoreData[] = [
  { number: "99BIS3", travee: "99BIS3", zone: "Zone 1" },
  { number: "99BIS2", travee: "99BIS2", zone: "Zone 1" },
  { number: "99BIS", travee: "99BIS", zone: "Zone 1" },
  { number: "10892", travee: "99BIS", zone: "Zone 1" },
  { number: "9673", travee: "99", zone: "Zone 1" },
  { number: "8999", travee: "99", zone: "Zone 1" },
  { number: "8214", travee: "100", zone: "Zone 1" },
  { number: "10297", travee: "100", zone: "Zone 1" },
  { number: "8176", travee: "102", zone: "Zone 1" },
  { number: "9617", travee: "103", zone: "Zone 1" },
  { number: "9616", travee: "201", zone: "Zone 1" },
  { number: "10032", travee: "201", zone: "Zone 1" },
  { number: "7518", travee: "202", zone: "Zone 1" },
  { number: "6243", travee: "202", zone: "Zone 1" },
  { number: "8485", travee: "202", zone: "Zone 1" },
  { number: "7879", travee: "202", zone: "Zone 1" },
  { number: "8074", travee: "204", zone: "Zone 1" },
  { number: "11964", travee: "204", zone: "Zone 1" },
  { number: "7878", travee: "204", zone: "Zone 1" },
  { number: "7576", travee: "204", zone: "Zone 1" },
  { number: "9738", travee: "301", zone: "Zone 1" },
  { number: "9684", travee: "301", zone: "Zone 1" },
  { number: "7822", travee: "301", zone: "Zone 1" },
  { number: "7389", travee: "303", zone: "Zone 1" },
  { number: "2088", travee: "303", zone: "Zone 1" },
  { number: "9571", travee: "303", zone: "Zone 1" },
  { number: "2971", travee: "304", zone: "Zone 1" },
  { number: "9738", travee: "304", zone: "Zone 1" },
  { number: "7039", travee: "306", zone: "Zone 1" },
  { number: "8154", travee: "306", zone: "Zone 1" },
  { number: "8214", travee: "306", zone: "Zone 1" },
  { number: "10892", travee: "306", zone: "Zone 1" },
  { number: "12671", travee: "401", zone: "Zone 1" },
  { number: "9668", travee: "401", zone: "Zone 1" },
  { number: "8484", travee: "402", zone: "Zone 1" },
  { number: "7922", travee: "402", zone: "Zone 1" },
  { number: "9083", travee: "402", zone: "Zone 1" },
  { number: "11843", travee: "404", zone: "Zone 1" },
  { number: "8060", travee: "501", zone: "Zone 1" },
  { number: "9668", travee: "501", zone: "Zone 1" },
  { number: "10712", travee: "501", zone: "Zone 1" },
  { number: "6059", travee: "503", zone: "Zone 1" },
  { number: "8486", travee: "503", zone: "Zone 1" },
  { number: "7822", travee: "504", zone: "Zone 1" },
  { number: "7450", travee: "504", zone: "Zone 1" },
  { number: "11839", travee: "504", zone: "Zone 1" },
  { number: "8215", travee: "602", zone: "Zone 1" },
  { number: "8214", travee: "603", zone: "Zone 1" },
  { number: "8215", travee: "603", zone: "Zone 1" },
  { number: "9669", travee: "603", zone: "Zone 1" },
  { number: "10574", travee: "701", zone: "Zone 1" },
  { number: "11754", travee: "701", zone: "Zone 1" },
  { number: "9812", travee: "702", zone: "Zone 1" },
  { number: "9673", travee: "702", zone: "Zone 1" },
  { number: "9796", travee: "704", zone: "Zone 1" },
  { number: "7859", travee: "704", zone: "Zone 1" },
  { number: "9037", travee: "801", zone: "Zone 1" },
  { number: "6317", travee: "801", zone: "Zone 1" },
  { number: "8858", travee: "803", zone: "Zone 1" },
  { number: "9796", travee: "803", zone: "Zone 1" },
  { number: "10892", travee: "DEB", zone: "Débord" },
  { number: "9083", travee: "DEB4", zone: "Débord" },
  { number: "7879", travee: "DEB4", zone: "Débord" },
  { number: "7576", travee: "DEB3", zone: "Débord" },
  { number: "7822", travee: "DEB2", zone: "Débord" },
  { number: "9571", travee: "DEB1", zone: "Débord" },
  { number: "8154", travee: "85", zone: "Débord" },
  { number: "10892", travee: "84", zone: "Débord" },
  { number: "9083", travee: "83", zone: "Débord" },
  { number: "8486", travee: "80", zone: "Débord" },
  { number: "11839", travee: "79", zone: "Débord" },
  { number: "9669", travee: "77", zone: "Débord" },
  { number: "9673", travee: "75", zone: "Débord" },
  { number: "6317", travee: "73", zone: "Débord" },
  { number: "9796", travee: "72", zone: "Débord" },
  { number: "10678", travee: "86", zone: "Craft" },
  { number: "9562", travee: "87", zone: "Craft" },
  { number: "9660", travee: "88", zone: "Craft" },
  { number: "9083", travee: "89", zone: "Craft" },
  { number: "11694", travee: "90", zone: "Craft" },
  { number: "8074", travee: "91", zone: "Craft" },
  { number: "10574", travee: "92", zone: "Craft" },
  { number: "7859", travee: "94", zone: "Craft" },
  { number: "10032", travee: "95", zone: "Craft" },
];

function readJson<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? (JSON.parse(data) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function isQuotaExceededError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

export function getPlanStorageErrorMessage(error: unknown): string {
  if (isQuotaExceededError(error)) {
    return "Le stockage du téléphone est plein. Supprimez d'anciens plans ou importez une image plus légère.";
  }

  return "Impossible d'enregistrer ce plan sur ce téléphone.";
}

function dedupeStores(stores: StoreData[]): StoreData[] {
  const seen = new Set<string>();
  const result: StoreData[] = [];
  const singleSlotTaken = new Set<string>(); // travées Craft/Débord déjà occupées

  for (const store of stores) {
    const key = `${store.number}-${store.travee}-${store.zone}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Règle Pékin : 1 seul magasin par travée en Craft / Débord
    const zone = normalizeZone(store.zone);
    if (zone === "Craft" || zone === "Débord") {
      const slot = `${zone}|${String(store.travee).trim().toUpperCase()}`;
      if (singleSlotTaken.has(slot)) continue;
      singleSlotTaken.add(slot);
    }
    result.push(store);
  }
  return result;
}

function normalizeZone(zone: string): string {
  const normalized = (zone || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("craft") || normalized.includes("kraft")) return "Craft";
  if (normalized.includes("debord") || normalized.includes("deb")) return "Débord";
  return zone || "Zone 1";
}

function normalizeStores(stores: StoreData[]): StoreData[] {
  return stores.map((store) => ({
    ...store,
    number: String(store.number).trim(),
    travee: String(store.travee).trim(),
    zone: normalizeZone(store.zone),
  }));
}

function dedupePlanRecord(plan: PlanRecord): PlanRecord {
  return {
    ...plan,
    stores: dedupeStores(plan.stores),
  };
}

export function getSearchableStores(): StoreData[] {
  const activePlan = getActivePlan();
  if (activePlan) {
    return dedupeStores(normalizeStores(activePlan.stores));
  }

  return [];
}

export function getStores(): StoreData[] {
  const stores = readJson<StoreData[]>(STORES_KEY, []);
  return dedupeStores(normalizeStores(stores));
}

export function initDemoStores(): void {
  localStorage.removeItem(STORES_KEY);
}

export function setStores(stores: StoreData[]): void {
  writeJson(STORES_KEY, dedupeStores(normalizeStores(stores)));
}

export function getStoreNames(): StoreName[] {
  return readJson<StoreName[]>(NAMES_KEY, []);
}

export function setStoreNames(names: StoreName[]): void {
  writeJson(NAMES_KEY, names);
}

export function addStoreName(number: string, name: string): void {
  const names = getStoreNames();
  const existing = names.findIndex(n => n.number === number);
  if (existing >= 0) {
    names[existing].name = name;
  } else {
    names.push({ number, name });
  }
  setStoreNames(names);
}

export function removeStoreName(number: string): void {
  const names = getStoreNames().filter(n => n.number !== number);
  setStoreNames(names);
}

export function getActivePlanId(): string | null {
  return localStorage.getItem(ACTIVE_PLAN_KEY);
}

export function setActivePlanId(planId: string | null): void {
  if (planId) {
    localStorage.setItem(ACTIVE_PLAN_KEY, planId);
    return;
  }

  localStorage.removeItem(ACTIVE_PLAN_KEY);
}

export function getPlans(): PlanRecord[] {
  return readJson<PlanRecord[]>(PLANS_KEY, []).map(dedupePlanRecord);
}

function setPlans(plans: PlanRecord[]): void {
  const normalizedPlans = plans.map(dedupePlanRecord);
  let persistedPlans = normalizedPlans;

  while (persistedPlans.length > 0) {
    try {
      writeJson(PLANS_KEY, persistedPlans);
      return;
    } catch (error) {
      if (!isQuotaExceededError(error) || persistedPlans.length === 1) {
        throw error;
      }

      persistedPlans = persistedPlans.slice(0, -1);
    }
  }

  writeJson(PLANS_KEY, []);
}

export function getPlanById(id: string): PlanRecord | null {
  return getPlans().find((plan) => plan.id === id) ?? null;
}

export function getActivePlan(): PlanRecord | null {
  const activePlanId = getActivePlanId();
  return activePlanId ? getPlanById(activePlanId) : null;
}

export function countFilledTravees(stores: StoreData[]): number {
  // Règle Pékin :
  // - Zone 1 : 1 tournée = 1 travée remplie (peu importe le nombre de magasins)
  // - Craft / Débord : 1 magasin = 1 tournée
  const zone1Travees = new Set<string>();
  let singleStoreTournees = 0;
  for (const store of normalizeStores(stores)) {
    const travee = store.travee.trim();
    if (!travee) continue;
    const zone = normalizeZone(store.zone);
    if (zone === "Craft" || zone === "Débord") {
      singleStoreTournees += 1;
    } else {
      zone1Travees.add(travee.toUpperCase());
    }
  }
  return zone1Travees.size + singleStoreTournees;
}

export function activatePlan(id: string): PlanRecord | null {
  const plan = getPlanById(id);
  if (!plan) return null;

  setActivePlanId(id);

  if (plan.stores.length > 0) {
    setStores(plan.stores);
  } else {
    localStorage.removeItem(STORES_KEY);
  }

  return plan;
}

export function savePlan(plan: PlanRecord): void {
  const normalizedPlan = dedupePlanRecord(plan);
  const plans = getPlans();
  const existing = plans.findIndex((p) => p.id === normalizedPlan.id);

  if (existing >= 0) {
    plans[existing] = normalizedPlan;
  } else {
    plans.unshift(normalizedPlan);
  }

  setPlans(plans);
  setActivePlanId(normalizedPlan.id);

  if (normalizedPlan.stores.length > 0) {
    setStores(normalizedPlan.stores);
  } else {
    localStorage.removeItem(STORES_KEY);
  }
}

export function updatePlanStores(id: string, stores: StoreData[]): PlanRecord | null {
  const plans = getPlans();
  const index = plans.findIndex((plan) => plan.id === id);

  if (index < 0) return null;

  const updatedPlan = dedupePlanRecord({
    ...plans[index],
    stores,
  });

  plans[index] = updatedPlan;
  setPlans(plans);

  if (getActivePlanId() === id) {
    if (updatedPlan.stores.length > 0) {
      setStores(updatedPlan.stores);
    } else {
      localStorage.removeItem(STORES_KEY);
    }
  }

  return updatedPlan;
}

export function deletePlan(id: string): void {
  const plans = getPlans().filter(p => p.id !== id);
  setPlans(plans);

  if (getActivePlanId() !== id) return;

  const nextPlan = plans.find((plan) => plan.stores.length > 0) ?? plans[0] ?? null;
  setActivePlanId(nextPlan?.id ?? null);

  if (nextPlan?.stores.length) {
    setStores(nextPlan.stores);
    return;
  }

  localStorage.removeItem(STORES_KEY);
}

// --- Fuzzy / phonetic helpers --------------------------------------------------
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Simple French phonetic key (handles roquette/rouquette, courbevoie/courbevoit, etc.)
function phoneticKey(s: string): string {
  let x = normalizeText(s).replace(/\s+/g, "");
  x = x
    .replace(/ph/g, "f")
    .replace(/qu/g, "k")
    .replace(/q/g, "k")
    .replace(/c([eiy])/g, "s$1")
    .replace(/c/g, "k")
    .replace(/ch/g, "ʃ")
    .replace(/sc/g, "s")
    .replace(/sh/g, "ʃ")
    .replace(/ou/g, "u")
    .replace(/au|eau/g, "o")
    .replace(/ai|ei/g, "e")
    .replace(/oi/g, "wa")
    .replace(/gn/g, "n")
    .replace(/[hwy]/g, "")
    .replace(/(.)\1+/g, "$1") // collapse doubles (roquette/rouquette)
    .replace(/[aeiou]/g, "");
  return x;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1).fill(0).map((_, i) => i);
  const v1 = new Array(b.length + 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

export interface StoreSuggestion {
  number: string;
  name?: string;
  matches: StoreData[];
  score: number;
}

// Autocomplete-style suggestions: matches by name prefix/contains and by number
export function suggestStores(query: string, limit = 30): StoreSuggestion[] {
  const stores = getSearchableStores();
  const names = getStoreNames();
  const q = normalizeText(query);
  if (!q) return [];

  const numberMap = new Map<string, StoreData[]>();
  for (const s of stores) {
    if (!numberMap.has(s.number)) numberMap.set(s.number, []);
    numberMap.get(s.number)!.push(s);
  }

  const results: StoreSuggestion[] = [];
  const seen = new Set<string>();
  const compact = q.replace(/\s+/g, "");

  // Name-based matches (prefix > contains)
  for (const n of names) {
    if (!numberMap.has(n.number)) continue;
    const nm = normalizeText(n.name);
    let score = -1;
    if (nm.startsWith(q)) score = 0;
    else if (nm.split(" ").some(w => w.startsWith(q))) score = 1;
    else if (nm.includes(q)) score = 2;
    if (score >= 0 && !seen.has(n.number)) {
      seen.add(n.number);
      results.push({ number: n.number, name: n.name, matches: numberMap.get(n.number)!, score });
    }
  }

  // Number-based matches
  for (const [num, matches] of numberMap) {
    if (seen.has(num)) continue;
    if (num.toLowerCase().startsWith(compact)) {
      seen.add(num);
      const nm = names.find(n => n.number === num);
      results.push({ number: num, name: nm?.name, matches, score: 3 });
    }
  }
  // Pour les chiffres, ne pas afficher des magasins qui contiennent juste 1 ou 2 chiffres tapés
  // (ex: taper "8" ne doit pas proposer "1168"). C'est ce qui donnait l'impression de faux magasins.
  if (compact.length >= 3) {
    for (const [num, matches] of numberMap) {
      if (seen.has(num)) continue;
      if (num.toLowerCase().includes(compact)) {
        seen.add(num);
        const nm = names.find(n => n.number === num);
        results.push({ number: num, name: nm?.name, matches, score: 4 });
      }
    }
  }

  results.sort((a, b) => a.score - b.score || a.number.localeCompare(b.number));
  return results.slice(0, limit);
}

export function searchStore(query: string): { store: StoreData; name?: string; allMatches?: StoreData[] } | null {
  const stores = getSearchableStores();
  const names = getStoreNames();

  const raw = query.trim();
  const q = raw.toLowerCase();
  const compactQuery = q.replace(/\s+/g, "");
  if (!q) return null;

  const searchableNumbers = new Set(stores.map((store) => store.number));
  const usableNames = names.filter(n => searchableNumbers.has(n.number));
  const qNorm = normalizeText(raw);

  // Si la requête est purement numérique : exiger une correspondance EXACTE
  const isNumericQuery = /^\d+$/.test(compactQuery);
  if (isNumericQuery) {
    const exactMatch = stores.find(s => s.number.toLowerCase() === compactQuery);
    if (exactMatch) {
      const name = names.find(n => n.number === exactMatch.number);
      return { store: exactMatch, name: name?.name, allMatches: stores.filter(s => s.number === exactMatch.number) };
    }
    return null; // pas de fuzzy / partiel sur les chiffres
  }

  // Texte : correspondance exacte par nom complet uniquement (l'utilisateur doit cliquer
  // une suggestion du menu pour les correspondances partielles)
  const exactName = usableNames.find(n => normalizeText(n.name) === qNorm);
  if (exactName) {
    const store = stores.find(s => s.number === exactName.number)!;
    return { store, name: exactName.name, allMatches: stores.filter(s => s.number === exactName.number) };
  }

  // Code mixte (lettres+chiffres) : exact uniquement
  const exactCode = stores.find(s => s.number.toLowerCase() === compactQuery);
  if (exactCode) {
    const name = names.find(n => n.number === exactCode.number);
    return { store: exactCode, name: name?.name, allMatches: stores.filter(s => s.number === exactCode.number) };
  }

  return null;
}

// Recherche par numéro de travée — retourne tous les magasins de la travée
export interface TraveeResult {
  travee: string;
  zone: string;
  stores: { number: string; name?: string; emplacement: number }[];
}

export function searchByTravee(query: string): TraveeResult[] {
  const stores = getSearchableStores();
  const names = getStoreNames();
  const compact = query.trim().toLowerCase().replace(/\s+/g, "");
  if (!compact) return [];

  const matches = (travee: string): boolean => {
    const t = travee.toLowerCase();
    if (t === compact) return true;
    // Si la requête est une lettre seule (ex: "x"), match toute travée
    // qui contient cette lettre comme jeton distinct (ex: "X", "X1", "306X", "X 306")
    if (/^[a-z]$/.test(compact)) {
      const tokens = t.split(/[^a-z0-9]+/).filter(Boolean);
      if (tokens.includes(compact)) return true;
      // lettre attachée à des chiffres (ex: "306x" ou "x1")
      const re = new RegExp(`(^|\\d)${compact}(\\d|$)`);
      if (re.test(t)) return true;
    }
    return false;
  };

  const groups = new Map<string, StoreData[]>();
  for (const s of stores) {
    if (matches(s.travee)) {
      const key = `${s.travee}|${s.zone}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
  }
  if (groups.size === 0) return [];

  const nameOf = (num: string) => names.find(n => n.number === num)?.name;
  const results: TraveeResult[] = [];
  for (const [key, list] of groups) {
    const [travee, zone] = key.split("|");
    results.push({
      travee,
      zone,
      stores: list.map((s, i) => ({ number: s.number, name: nameOf(s.number), emplacement: i + 1 })),
    });
  }
  return results;
}

// Recherche permissive (phonétique/fuzzy) — utilisée UNIQUEMENT pour la saisie vocale
export function searchStoreFuzzy(query: string): { store: StoreData; name?: string; allMatches?: StoreData[] } | null {
  const exact = searchStore(query);
  if (exact) return exact;

  const stores = getSearchableStores();
  const names = getStoreNames();
  const raw = query.trim();
  if (!raw) return null;
  const compactQuery = raw.toLowerCase().replace(/\s+/g, "");
  if (/^\d+$/.test(compactQuery)) return null; // chiffres : exact uniquement

  const searchableNumbers = new Set(stores.map((s) => s.number));
  const usableNames = names.filter(n => searchableNumbers.has(n.number));
  const qNorm = normalizeText(raw);
  const qPhon = phoneticKey(raw);

  // contient le nom
  const contains = usableNames.find(n => normalizeText(n.name).includes(qNorm));
  if (contains) {
    const store = stores.find(s => s.number === contains.number)!;
    return { store, name: contains.name, allMatches: stores.filter(s => s.number === contains.number) };
  }

  // phonétique / Levenshtein
  let best: { n: StoreName; score: number } | null = null;
  for (const n of usableNames) {
    const tokens = normalizeText(n.name).split(" ");
    for (const tok of tokens) {
      const kPhon = phoneticKey(tok);
      const dPhon = levenshtein(qPhon, kPhon);
      const dRaw = levenshtein(qNorm, tok);
      const score = Math.min(dPhon, dRaw);
      const maxLen = Math.max(qNorm.length, tok.length);
      if (dPhon === 0 || score <= Math.max(1, Math.floor(maxLen * 0.34))) {
        if (!best || score < best.score) best = { n, score };
      }
    }
  }
  if (best) {
    const store = stores.find(s => s.number === best!.n.number)!;
    return { store, name: best.n.name, allMatches: stores.filter(s => s.number === best!.n.number) };
  }
  return null;
}
