// Jours fériés français — calcul local (aucun appel réseau)
// Couvre tous les jours fériés métropole.

function easterSunday(year: number): Date {
  // Algorithme de Meeus / Jones / Butcher
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const cache = new Map<number, Record<string, string>>();

export function holidaysFor(year: number): Record<string, string> {
  if (cache.has(year)) return cache.get(year)!;
  const easter = easterSunday(year);
  const map: Record<string, string> = {
    [`${year}-01-01`]: "Jour de l'an",
    [`${year}-05-01`]: "Fête du Travail",
    [`${year}-05-08`]: "Victoire 1945",
    [`${year}-07-14`]: "Fête nationale",
    [`${year}-08-15`]: "Assomption",
    [`${year}-11-01`]: "Toussaint",
    [`${year}-11-11`]: "Armistice 1918",
    [`${year}-12-25`]: "Noël",
    [toKey(addDays(easter, 1))]: "Lundi de Pâques",
    [toKey(addDays(easter, 39))]: "Ascension",
    [toKey(addDays(easter, 50))]: "Lundi de Pentecôte",
  };
  cache.set(year, map);
  return map;
}

export function getHolidayName(dateStr: string): string | null {
  const y = Number(dateStr.slice(0, 4));
  if (!y) return null;
  return holidaysFor(y)[dateStr] ?? null;
}
