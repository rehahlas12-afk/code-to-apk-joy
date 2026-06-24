import { supabase } from "@/integrations/supabase/client";
import type { StoreData } from "./store";

/**
 * Analyze a plan image using AI vision (Gemini) to extract structured store data.
 * Sends the image to a backend edge function that uses table extraction.
 * Falls back to basic client-side OCR if the backend is unavailable.
 */
export async function ocrAnalyzePlan(
  imageData: string,
  onProgress?: (progress: number) => void
): Promise<StoreData[]> {
  onProgress?.(10);

  try {
    const stores = await analyzeWithAI(imageData, onProgress);
    if (shouldUseAdaptiveFallback(stores)) {
      console.warn(`AI OCR returned only ${stores.length} stores, activating adaptive geometric fallback`);
      onProgress?.(30);
      const fallbackStores = await fallbackLocalOcr(imageData, onProgress);
      if (fallbackStores.length > stores.length) {
        onProgress?.(100);
        return assertReliablePlanRead(fallbackStores);
      }
    }
    onProgress?.(100);
    return assertReliablePlanRead(stores);
  } catch (error) {
    console.error("AI analysis failed, falling back to local OCR:", error);
    onProgress?.(30);
    // Fallback to local parsing
    const stores = await fallbackLocalOcr(imageData, onProgress);
    onProgress?.(100);
    return assertReliablePlanRead(stores);
  }
}

async function analyzeWithAI(
  imageData: string,
  onProgress?: (progress: number) => void
): Promise<StoreData[]> {
  onProgress?.(20);

  const { data, error } = await supabase.functions.invoke("analyze-plan", {
    body: { imageBase64: imageData },
  });

  onProgress?.(90);

  if (error) {
    throw new Error(`Edge function error: ${error.message}`);
  }

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

type OcrWord = {
  text?: string;
  confidence?: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
};

export const MIN_RELIABLE_PLAN_STORES = 35;
const MIN_RELIABLE_PLAN_TRAVEES = 12;

function assertReliablePlanRead(stores: StoreData[]): StoreData[] {
  const reliableTravees = new Set(
    stores
      .map((store) => String(store.travee || "").trim().toUpperCase())
      .filter((travee) => travee && travee !== "?"),
  );

  if (stores.length >= MIN_RELIABLE_PLAN_STORES && reliableTravees.size >= MIN_RELIABLE_PLAN_TRAVEES) {
    return stores;
  }

  throw new Error(
    `Analyse incomplète : ${stores.length} magasins et ${reliableTravees.size} travées détectés. Le plan n'a pas été remplacé.`
  );
}

function shouldUseAdaptiveFallback(stores: StoreData[]): boolean {
  return stores.length < MIN_RELIABLE_PLAN_STORES;
}

function loadImageForOcr(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Impossible de préparer l'image OCR"));
    image.src = src;
  });
}

async function createHighContrastOcrVariant(imageData: string): Promise<string | null> {
  if (typeof document === "undefined") return null;

  const image = await loadImageForOcr(imageData);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) return null;

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  let totalLuma = 0;

  for (let index = 0; index < pixels.data.length; index += 4) {
    totalLuma += pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114;
  }

  const averageLuma = totalLuma / (pixels.data.length / 4);
  const shouldInvert = averageLuma < 128;

  for (let index = 0; index < pixels.data.length; index += 4) {
    const luma = pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114;
    const corrected = shouldInvert ? 255 - luma : luma;
    const value = corrected > 150 ? 255 : 0;
    pixels.data[index] = value;
    pixels.data[index + 1] = value;
    pixels.data[index + 2] = value;
    pixels.data[index + 3] = 255;
  }

  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/png");
}

async function createLocalOcrVariants(imageData: string): Promise<string[]> {
  try {
    const highContrast = await createHighContrastOcrVariant(imageData);
    return highContrast ? [imageData, highContrast] : [imageData];
  } catch (error) {
    console.warn("OCR preprocessing failed, using original image", error);
    return [imageData];
  }
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

function isServiceToken(token: string): boolean {
  return /^(M|F|S|H|X)$/.test(token) || /^5H0{2}$/.test(token) || /^H0{2}$/.test(token) || /^DEB\d?$/.test(token);
}

function detectLineZone(normalizedLine: string, tokens: string[]): { zone: string | null; explicit: boolean; persistent: boolean } {
  for (const { pattern, zone } of ZONE_PATTERNS) {
    if (!pattern.test(normalizedLine)) continue;

    const isDebTraveeAtEnd = zone === "Débord" && tokens.some((token, index) => /^DEB\d?$/.test(token) && index > 0);
    if (isDebTraveeAtEnd) return { zone: null, explicit: false, persistent: false };

    return {
      zone,
      explicit: true,
      persistent: true,
    };
  }

  return { zone: null, explicit: false, persistent: false };
}

function isTraveeToken(token: string): boolean {
  return (
    /^99BIS\d?$/.test(token) ||
    /^DEB\d?$/.test(token) ||
    /^[1-9]\d{1,2}$/.test(token) ||
    /^[A-WYZ]$/.test(token) ||      // travées lettre seule (X, Y, A, etc.)
    /^X$/.test(token) ||
    /^[A-Z]\d{1,2}$/.test(token) || // ex: X1, A2
    /^\d{1,3}[A-Z]$/.test(token)    // ex: 306X (sera traitée comme travée à part)
  );
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
    if (isServiceToken(tokens[i])) continue;

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
      if (isServiceToken(tokens[cursor])) break;

      const nextToken = normalizePotentialNumber(tokens[cursor]).replace(/[^0-9]/g, "");
      if (!nextToken || combined.length + nextToken.length > 5) break;

      // Sur les plans STAF, les petits nombres après M/F/S sont des quantités.
      // Exemple réel : "6317 F 6 8485" doit donner 6317 et 8485, jamais 68485.
      if (/^\d{4,5}$/.test(nextToken)) break;

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

export function reconstructTextFromGeometry(words: OcrWord[]): string {
  const usableWords = words
    .filter((word) => word.text?.trim() && word.bbox)
    .map((word) => ({
      text: word.text!.trim(),
      confidence: word.confidence ?? 100,
      x0: word.bbox!.x0,
      x1: word.bbox!.x1,
      y0: word.bbox!.y0,
      y1: word.bbox!.y1,
      height: Math.max(1, word.bbox!.y1 - word.bbox!.y0),
    }))
    .filter((word) => word.confidence >= 15 || /\d/.test(word.text));

  if (!usableWords.length) return "";

  const medianHeight = usableWords
    .map((word) => word.height)
    .sort((a, b) => a - b)[Math.floor(usableWords.length / 2)] || 12;
  const yTolerance = Math.max(6, medianHeight * 0.65);

  const lines: Array<{ y: number; words: typeof usableWords }> = [];
  for (const word of usableWords.sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2)) {
    const centerY = (word.y0 + word.y1) / 2;
    let line = lines.find((candidate) => Math.abs(candidate.y - centerY) <= yTolerance);
    if (!line) {
      line = { y: centerY, words: [] as typeof usableWords };
      lines.push(line);
    }
    line.words.push(word);
    line.y = (line.y * (line.words.length - 1) + centerY) / line.words.length;
  }

  return lines
    .sort((a, b) => a.y - b.y)
    .map((line) => {
      const sortedWords = line.words.sort((a, b) => a.x0 - b.x0);
      const widths = sortedWords.map((word) => Math.max(1, word.x1 - word.x0));
      const medianWidth = widths.sort((a, b) => a - b)[Math.floor(widths.length / 2)] || 20;
      const gapThreshold = Math.max(10, medianWidth * 0.45);

      return sortedWords.reduce((text, word, index) => {
        if (index === 0) return word.text;
        const previous = sortedWords[index - 1];
        const gap = word.x0 - previous.x1;
        return `${text}${gap > gapThreshold ? "  " : " "}${word.text}`;
      }, "");
    })
    .join("\n");
}

function chooseBestParsedStores(textStores: StoreData[], geometricStores: StoreData[]): StoreData[] {
  const mergedStores = dedupeStores([...textStores, ...geometricStores]);
  const bestSingleRead = geometricStores.length > textStores.length ? geometricStores : textStores;
  return mergedStores.length >= bestSingleRead.length ? mergedStores : bestSingleRead;
}

export function parseOcrText(text: string): StoreData[] {
  const stores: StoreData[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let currentZone = "Zone 1";
  let currentTravee = "";

  for (const line of lines) {
    const normalizedLine = normalizeOcrLine(line);
    const tokens = tokenizeLine(normalizedLine);
    const lineZone = detectLineZone(normalizedLine, tokens);
    const explicitZoneOnLine = lineZone.explicit;

    if (lineZone.zone && lineZone.persistent) {
      currentZone = lineZone.zone;
    }

    currentTravee = extractTravee(normalizedLine, currentTravee);
    const inferredZone = inferZoneFromTravee(currentTravee, lineZone.zone ?? currentZone, explicitZoneOnLine);
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
    const variants = await createLocalOcrVariants(imageData);
    let bestStores: StoreData[] = [];

    for (let index = 0; index < variants.length; index += 1) {
      const progressStart = 30 + Math.round((index / variants.length) * 60);
      const progressRange = Math.round(60 / variants.length);
      const result = await Tesseract.recognize(variants[index], "fra", {
        logger: (message) => {
          if (message.status === "recognizing text") {
            onProgress?.(progressStart + Math.round(message.progress * progressRange));
          }
        },
      });

      console.log(`Fallback OCR text variant ${index + 1}:`, result.data.text);
      const textStores = parseOcrText(result.data.text);
      const geometricText = reconstructTextFromGeometry((result.data.words ?? []) as OcrWord[]);
      const geometricStores = geometricText ? parseOcrText(geometricText) : [];
      const variantStores = chooseBestParsedStores(textStores, geometricStores);

      if (geometricStores.length > textStores.length) {
        console.log(`Adaptive geometric OCR text variant ${index + 1}:`, geometricText);
      }
      if (variantStores.length > bestStores.length) {
        bestStores = variantStores;
      }
    }

    return bestStores;
  } catch (err) {
    console.error("Fallback OCR also failed:", err);
    return [];
  }
}
