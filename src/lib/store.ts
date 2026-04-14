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

function dedupeStores(stores: StoreData[]): StoreData[] {
  const seen = new Set<string>();

  return stores.filter((store) => {
    const key = `${store.number}-${store.travee}-${store.zone}`;

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupePlanRecord(plan: PlanRecord): PlanRecord {
  return {
    ...plan,
    stores: dedupeStores(plan.stores),
  };
}

function getSearchableStores(): StoreData[] {
  const activePlan = getActivePlan();
  if (activePlan) {
    return dedupeStores(activePlan.stores);
  }

  const latestAnalyzedPlan = getPlans().find((plan) => plan.stores.length > 0);
  if (latestAnalyzedPlan) {
    return dedupeStores(latestAnalyzedPlan.stores);
  }

  const storedStores = readJson<StoreData[]>(STORES_KEY, []);
  if (storedStores.length > 0) {
    return dedupeStores(storedStores);
  }

  initDemoStores();
  return readJson<StoreData[]>(STORES_KEY, DEMO_STORES);
}

export function getStores(): StoreData[] {
  const stores = readJson<StoreData[]>(STORES_KEY, []);
  if (stores.length > 0) return dedupeStores(stores);
  initDemoStores();
  return readJson<StoreData[]>(STORES_KEY, []);
}

export function initDemoStores(): void {
  if (localStorage.getItem(STORES_KEY)) return;
  writeJson(STORES_KEY, DEMO_STORES);
}

export function setStores(stores: StoreData[]): void {
  writeJson(STORES_KEY, dedupeStores(stores));
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
  writeJson(PLANS_KEY, plans.map(dedupePlanRecord));
}

export function getPlanById(id: string): PlanRecord | null {
  return getPlans().find((plan) => plan.id === id) ?? null;
}

export function getActivePlan(): PlanRecord | null {
  const activePlanId = getActivePlanId();
  return activePlanId ? getPlanById(activePlanId) : null;
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

  if (!nextPlan) {
    initDemoStores();
  }
}

export function searchStore(query: string): { store: StoreData; name?: string; allMatches?: StoreData[] } | null {
  const stores = getSearchableStores();
  const names = getStoreNames();
  
  const q = query.trim().toLowerCase();
  const compactQuery = q.replace(/\s+/g, "");
  if (!q) return null;

  const searchableNumbers = new Set(stores.map((store) => store.number));
  
  // Search by name first
  const nameMatch = names.find(n => searchableNumbers.has(n.number) && n.name.toLowerCase().includes(q));
  if (nameMatch) {
    const store = stores.find(s => s.number === nameMatch.number);
    if (store) {
      const allMatches = stores.filter(s => s.number === nameMatch.number);
      return { store, name: nameMatch.name, allMatches };
    }
  }
  
  // Search by exact number
  const exactMatch = stores.find(s => s.number.toLowerCase() === compactQuery);
  if (exactMatch) {
    const name = names.find(n => n.number === exactMatch.number);
    const allMatches = stores.filter(s => s.number === exactMatch.number);
    return { store: exactMatch, name: name?.name, allMatches };
  }

  // Search by partial number (contains)
  const partialMatches = stores.filter(s => s.number.toLowerCase().includes(compactQuery));
  if (partialMatches.length > 0) {
    const store = partialMatches[0];
    const name = names.find(n => n.number === store.number);
    return { store, name: name?.name, allMatches: partialMatches };
  }
  
  return null;
}
