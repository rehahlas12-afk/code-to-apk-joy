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

export function getStores(): StoreData[] {
  const data = localStorage.getItem(STORES_KEY);
  if (data) return JSON.parse(data);
  // Auto-load demo data on first use
  initDemoStores();
  const d2 = localStorage.getItem(STORES_KEY);
  return d2 ? JSON.parse(d2) : [];
}

export function initDemoStores(): void {
  if (localStorage.getItem(STORES_KEY)) return;
  const demo: StoreData[] = [
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
  localStorage.setItem(STORES_KEY, JSON.stringify(demo));
}

export function setStores(stores: StoreData[]): void {
  localStorage.setItem(STORES_KEY, JSON.stringify(stores));
}

export function getStoreNames(): StoreName[] {
  const data = localStorage.getItem(NAMES_KEY);
  return data ? JSON.parse(data) : [];
}

export function setStoreNames(names: StoreName[]): void {
  localStorage.setItem(NAMES_KEY, JSON.stringify(names));
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

export function getPlans(): PlanRecord[] {
  const data = localStorage.getItem(PLANS_KEY);
  return data ? JSON.parse(data) : [];
}

export function savePlan(plan: PlanRecord): void {
  const plans = getPlans();
  plans.unshift(plan);
  localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
}

export function deletePlan(id: string): void {
  const plans = getPlans().filter(p => p.id !== id);
  localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
}

export function searchStore(query: string): { store: StoreData; name?: string; allMatches?: StoreData[] } | null {
  const stores = getStores();
  const names = getStoreNames();
  
  const q = query.trim().toLowerCase();
  if (!q) return null;
  
  // Search by name first
  const nameMatch = names.find(n => n.name.toLowerCase().includes(q));
  if (nameMatch) {
    const store = stores.find(s => s.number === nameMatch.number);
    if (store) {
      const allMatches = stores.filter(s => s.number === nameMatch.number);
      return { store, name: nameMatch.name, allMatches };
    }
  }
  
  // Search by exact number
  const exactMatch = stores.find(s => s.number.toLowerCase() === q);
  if (exactMatch) {
    const name = names.find(n => n.number === exactMatch.number);
    const allMatches = stores.filter(s => s.number === exactMatch.number);
    return { store: exactMatch, name: name?.name, allMatches };
  }

  // Search by partial number (contains)
  const partialMatches = stores.filter(s => s.number.toLowerCase().includes(q));
  if (partialMatches.length > 0) {
    const store = partialMatches[0];
    const name = names.find(n => n.number === store.number);
    return { store, name: name?.name, allMatches: partialMatches };
  }
  
  return null;
}
