import type { StoreData } from "./store";

export async function ocrAnalyzePlan(
  imageData: string,
  onProgress?: (progress: number) => void
): Promise<StoreData[]> {
  onProgress?.(10);

  try {
    const stores = await analyzeWithAI(imageData, onProgress);
    onProgress?.(100);
    return stores;
  } catch (error) {
    console.error("AI analysis failed, falling back to local OCR:", error);
    onProgress?.(30);
    const stores = await fallbackLocalOcr(imageData, onProgress);
    onProgress?.(100);
    return stores;
  }
}

async function analyzeWithAI(
  imageData: string,
  onProgress?: (progress: number) => void
): Promise<StoreData[]> {
  onProgress?.(20);

  const response = await fetch("/api/analyze-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: imageData }),
  });

  onProgress?.(90);

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`API error: ${err.error ?? response.statusText}`);
  }

  const data = await response.json();

  if (data?.error) {
    throw new Error(data.error);
  }

  const stores: StoreData[] = data?.stores ?? [];
  console.log(`AI extracted ${stores.length} stores from plan`);
  return stores;
}

// ---- Fallback: local Tesseract OCR ----

import Tesseract from "tesseract.js";

// Common OCR misreads: letter → digit
const OCR_DIGIT_FIXES: Record<string, string> = {
  O: "0", Q: "0", I: "1", L: "1", "|": "1",
  Z: "2", S: "5", G: "6", B: "8",
};

function dedupeStores(stores: StoreData[]): StoreData[] {
  const seen = new Set<string>();
  return stores.filter((store) => {
    const key = `${store.number}-${store.travee}-${store.zone}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeOcrLine(line: string): string {
  return line
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/['']/g, "")
    .replace(/(\d)[,;:./\\-]+(?=\d)/g, "$1");
}

function applyDigitFixes(token: string): string {
  return token.split("").map((c) => OCR_DIGIT_FIXES[c] ?? c).join("");
}

function tokenizeLine(line: string): string[] {
  return line.match(/[A-Z0-9]+/g) ?? [];
}

/**
 * Determine the zone from the travée identifier.
 *
 * Travée ranges:
 *   Zone 1  : 99BIS*, 99, 101–104, 201–204, 301–306X, 401–404,
 *              501–504, 601–604, 701–704, 801–803
 *   Débord  : 72–85 (numeric) + DEB1–DEB5 (named)
 *   Craft   : 86–98 (numeric, labeled "CRAFT" on plan)
 */
function inferZone(travee: string): string {
  const t = travee.toUpperCase().trim();

  if (t.startsWith("DEB")) return "Débord";

  // strip trailing letters (e.g. "306X" → 306)
  const n = parseInt(t, 10);
  if (!isNaN(n)) {
    if (n >= 72 && n <= 85) return "Débord";
    if (n >= 86 && n <= 98) return "Craft";
  }

  return "Zone 1";
}

/**
 * Checks whether a token looks like a travée identifier.
 * Travée is always the FIRST recognizable element on a line.
 */
function isTraveeToken(token: string): boolean {
  // Named: 99BIS, 99BIS1, 99BIS2, 99BIS3 …
  if (/^99BIS\d*$/.test(token)) return true;
  // Named débord: DEB, DEB1 … DEB5
  if (/^DEB\d*$/.test(token)) return true;
  // Numeric travée with optional letter suffix (306X, 204X …)
  if (/^\d{2,3}[A-Z]?$/.test(token)) {
    const n = parseInt(token, 10);
    // Valid numeric travée range: 72–803
    return !isNaN(n) && n >= 72 && n <= 803;
  }
  // "99" on its own
  if (token === "99") return true;
  return false;
}

/**
 * Extract the travée from a normalised line.
 * We look for the FIRST token that looks like a travée.
 */
function extractTravee(tokens: string[], currentTravee: string): string {
  const found = tokens.find(isTraveeToken);
  return found ?? currentTravee;
}

/**
 * Extract store numbers from a normalised line.
 *
 * Store numbers are written AFTER the travée number.
 * They are 1–5 digit numbers.
 * Débord (72-85, DEB*) and Craft (86-98) travées always have exactly 1 store.
 */
function extractStoreNumbers(tokens: string[], currentTravee: string): string[] {
  const stores = new Set<string>();
  let traveeSkipped = false;

  for (const raw of tokens) {
    // Skip the travée token (only once, the first one)
    if (!traveeSkipped && isTraveeToken(raw)) {
      traveeSkipped = true;
      continue;
    }

    // Apply OCR fixes and strip non-digits
    const fixed = applyDigitFixes(raw).replace(/[^0-9]/g, "");
    if (!fixed) continue;

    // Accept 1–5 digit store numbers; exclude the travée number itself
    // (in case OCR repeats it)
    if (/^\d{1,5}$/.test(fixed) && fixed !== currentTravee) {
      stores.add(fixed);
    }
  }

  return [...stores];
}

export function parseOcrText(text: string): StoreData[] {
  const stores: StoreData[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let currentTravee = "";

  for (const line of lines) {
    const normalized = normalizeOcrLine(line);
    const tokens = tokenizeLine(normalized);

    if (tokens.length === 0) continue;

    // Detect explicit zone headers on the line (e.g. "DEBORD", "CRAFT")
    // — we use these only to help zone inference if the travée is ambiguous.
    // The travée-based zone inference takes priority.

    // Update current travée if this line announces one
    const newTravee = extractTravee(tokens, currentTravee);
    if (newTravee !== currentTravee) {
      currentTravee = newTravee;
    }

    if (!currentTravee) continue;

    const zone = inferZone(currentTravee);
    const storeNumbers = extractStoreNumbers(tokens, currentTravee);

    for (const num of storeNumbers) {
      stores.push({ number: num, travee: currentTravee, zone });
    }
  }

  return dedupeStores(stores);
}

async function fallbackLocalOcr(
  imageData: string,
  onProgress?: (progress: number) => void
): Promise<StoreData[]> {
  try {
    const result = await Tesseract.recognize(imageData, "fra", {
      logger: (message) => {
        if (message.status === "recognizing text") {
          onProgress?.(30 + Math.round(message.progress * 60));
        }
      },
    });
    console.log("Fallback OCR text:", result.data.text);
    return parseOcrText(result.data.text);
  } catch (err) {
    console.error("Fallback OCR also failed:", err);
    return [];
  }
}
