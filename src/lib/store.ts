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
  return data ? JSON.parse(data) : [];
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

export function searchStore(query: string): { store: StoreData; name?: string } | null {
  const stores = getStores();
  const names = getStoreNames();
  
  const q = query.trim().toLowerCase();
  
  // Search by name first
  const nameMatch = names.find(n => n.name.toLowerCase().includes(q));
  if (nameMatch) {
    const store = stores.find(s => s.number === nameMatch.number);
    if (store) return { store, name: nameMatch.name };
  }
  
  // Search by number
  const storeMatch = stores.find(s => s.number === q || s.number.includes(q));
  if (storeMatch) {
    const name = names.find(n => n.number === storeMatch.number);
    return { store: storeMatch, name: name?.name };
  }
  
  return null;
}
