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

  const provider = localStorage.getItem("aiProvider") || "gemini";
  const userKey = localStorage.getItem(`aiKey_${provider}`) || localStorage.getItem("userGeminiApiKey") || "";
  const response = await fetch("/api/analyze-plan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(provider ? { "x-ai-provider": provider } : {}),
      ...(userKey ? { "x-ai-key": userKey } : {}),
    },
    body: JSON.stringify({ imageBase64: imageData }),
  });

  onProgress?.(90);

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`API error: ${err.error ?? response.statusText}`);
  }

  const data = await response.json();
  if (data?.error) throw new Error(data.error);

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
 * Zone rules:
 *   Débord : DEB* prefix, or numeric travée 72–85
 *   Craft  : numeric travée 86–98 (labeled "CRAFT" on plan)
 *   Zone 1 : everything else (99, 99BIS*, 101–803)
 */
function inferZone(travee: string): string {
  const t = travee.toUpperCase().trim();
  if (t.startsWith("DEB")) return "Débord";
  const n = parseInt(t, 10);
  if (!isNaN(n)) {
    if (n >= 72 && n <= 85) return "Débord";
    if (n >= 86 && n <= 98) return "Craft";
  }
  return "Zone 1";
}

/**
 * A token is a travée if it is:
 *   - 99BIS, 99BIS1, 99BIS2, 99BIS3
 *   - DEB, DEB1…DEB5
 *   - A 2–3 digit number (72–803), optionally with a letter suffix (306X)
 */
function isTraveeToken(token: string): boolean {
  if (/^99BIS\d*$/.test(token)) return true;
  if (/^DEB\d*$/.test(token)) return true;
  // 2–3 digits with optional trailing letter (e.g. 306X)
  const m = token.match(/^(\d{2,3})[A-Z]?$/);
  if (m) {
    const n = parseInt(m[1], 10);
    return n >= 72 && n <= 803;
  }
  return false;
}

/**
 * Extract travée from tokens on a line.
 * The travée is the first token that looks like a travée identifier.
 */
function extractTravee(tokens: string[], currentTravee: string): string {
  return tokens.find(isTraveeToken) ?? currentTravee;
}

/**
 * Extract 4–5 digit store numbers from a line.
 *
 * Store numbers on the plan are 4 or 5 digits.
 * OCR sometimes splits one number into two adjacent tokens
 * (e.g. "9 673" → tokens ["9","673"]) — we recombine them.
 *
 * The travée token (always first) is skipped.
 */
function extractStoreNumbers(tokens: string[], currentTravee: string): string[] {
  const stores = new Set<string>();
  let traveeSkipped = false;
  let i = 0;

  while (i < tokens.length) {
    const raw = tokens[i];

    // Skip the travée token once
    if (!traveeSkipped && isTraveeToken(raw)) {
      traveeSkipped = true;
      i++;
      continue;
    }

    const fixed = applyDigitFixes(raw).replace(/[^0-9]/g, "");
    if (!fixed) { i++; continue; }

    // Direct 4–5 digit hit
    if (/^\d{4,5}$/.test(fixed)) {
      stores.add(fixed);
      i++;
      continue;
    }

    // Too long → skip
    if (fixed.length > 5) { i++; continue; }

    // Try combining with the next token(s) to reach 4–5 digits
    let combined = fixed;
    let cursor = i + 1;
    let combined_i = i;
    let found = false;
    while (combined.length < 5 && cursor < tokens.length) {
      const nextRaw = applyDigitFixes(tokens[cursor]).replace(/[^0-9]/g, "");
      if (!nextRaw || combined.length + nextRaw.length > 5) break;
      combined += nextRaw;
      if (/^\d{4,5}$/.test(combined)) {
        stores.add(combined);
        combined_i = cursor;
        found = true;
        break;
      }
      cursor++;
    }
    i = found ? combined_i + 1 : i + 1;
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

    currentTravee = extractTravee(tokens, currentTravee);
    if (!currentTravee) continue;

    const zone = inferZone(currentTravee);
    const numbers = extractStoreNumbers(tokens, currentTravee);

    for (const num of numbers) {
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
      logger: (m) => {
        if (m.status === "recognizing text") {
          onProgress?.(30 + Math.round(m.progress * 60));
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
