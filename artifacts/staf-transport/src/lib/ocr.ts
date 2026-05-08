import type { StoreData } from "./store";

/**
 * Analyze a plan image using AI vision (Gemini) to extract structured store data.
 * Sends the image to the api-server which uses Gemini for table extraction.
 * Falls back to basic client-side OCR if the backend is unavailable.
 */
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

// ---- Fallback: simple local text-based extraction ----

import Tesseract from "tesseract.js";

const OCR_DIGIT_FIXES: Record<string, string> = {
  O: "0", Q: "0", D: "0", I: "1", L: "1", "|": "1",
  Z: "2", S: "5", B: "8", G: "6",
};

const ZONE_PATTERNS: { pattern: RegExp; zone: string }[] = [
  { pattern: /DEBORD|DEB/i, zone: "Débord" },
  { pattern: /CRAFT|CRAFTER|KRAFT/i, zone: "Craft" },
  { pattern: /ZONE\s*1/i, zone: "Zone 1" },
];

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

function normalizePotentialNumber(token: string): string {
  return token.split("").map((char) => OCR_DIGIT_FIXES[char] ?? char).join("");
}

function inferZoneFromTravee(travee: string, fallbackZone: string, explicitZoneOnLine = false): string {
  if (travee.startsWith("DEB")) return "Débord";
  if (explicitZoneOnLine && /CRAFT|KRAFT/i.test(fallbackZone)) return "Craft";
  const traveeNumber = Number(travee);
  if (Number.isNaN(traveeNumber)) return fallbackZone;
  if (traveeNumber === 86) return "Débord";
  if (/CRAFT|KRAFT/i.test(fallbackZone)) return "Craft";
  if (traveeNumber >= 72 && traveeNumber <= 86) return "Débord";
  if (traveeNumber >= 86 && traveeNumber <= 95) return "Craft";
  return fallbackZone;
}

function tokenizeLine(normalizedLine: string): string[] {
  return normalizedLine.match(/[A-Z0-9|]+/g) ?? [];
}

function isTraveeToken(token: string): boolean {
  return /^99BIS\d?$/.test(token) || /^DEB\d?$/.test(token) || /^[1-9]\d{1,2}$/.test(token);
}

function extractTravee(normalizedLine: string, currentTravee: string): string {
  const tokens = tokenizeLine(normalizedLine);
  return tokens.find(isTraveeToken) ?? currentTravee;
}

function extractStoreNumbers(normalizedLine: string): string[] {
  const storeNumbers = new Set<string>();
  const tokens = tokenizeLine(normalizedLine);

  for (let i = 0; i < tokens.length; i += 1) {
    if (i === 0 && isTraveeToken(tokens[i])) continue;

    const normalizedToken = normalizePotentialNumber(tokens[i]).replace(/[^0-9]/g, "");
    if (!normalizedToken) continue;

    if (/^\d{4,5}$/.test(normalizedToken)) {
      storeNumbers.add(normalizedToken);
      continue;
    }
    if (normalizedToken.length >= 4) continue;

    let combined = normalizedToken;
    let cursor = i + 1;
    while (combined.length < 5 && cursor < tokens.length) {
      const nextToken = normalizePotentialNumber(tokens[cursor]).replace(/[^0-9]/g, "");
      if (!nextToken || combined.length + nextToken.length > 5) break;
      combined += nextToken;
      if (/^\d{4,5}$/.test(combined)) {
        storeNumbers.add(combined);
        i = cursor;
        break;
      }
      cursor += 1;
    }
  }
  return [...storeNumbers];
}

export function parseOcrText(text: string): StoreData[] {
  const stores: StoreData[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let currentZone = "Zone 1";
  let currentTravee = "";

  for (const line of lines) {
    const normalizedLine = normalizeOcrLine(line);
    let explicitZoneOnLine = false;

    for (const { pattern, zone } of ZONE_PATTERNS) {
      if (pattern.test(normalizedLine)) {
        currentZone = zone;
        explicitZoneOnLine = true;
        break;
      }
    }

    currentTravee = extractTravee(normalizedLine, currentTravee);
    const inferredZone = inferZoneFromTravee(currentTravee, currentZone, explicitZoneOnLine);
    const lineNumbers = extractStoreNumbers(normalizedLine);

    for (const num of lineNumbers) {
      stores.push({ number: num, travee: currentTravee || "?", zone: inferredZone });
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
