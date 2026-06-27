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
  const rawTextStores = typeof data?.rawText === "string" ? parseOcrText(data.rawText) : [];
  const selectedStores = chooseBestPlanRead(stores, rawTextStores);
  console.log(
    `AI OCR extracted ${selectedStores.length} stores from plan`,
    data?.source ? `source=${data.source}` : "",
  );
  return selectedStores;
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

type LineStoreEntry = { number: string; travee: string; zone?: string };

export const MIN_RELIABLE_PLAN_STORES = 35;
const MIN_RELIABLE_PLAN_TRAVEES = 12;

function getReadQuality(stores: StoreData[]): { travees: number; score: number } {
  const travees = new Set(
    stores
      .map((store) => String(store.travee || "").trim().toUpperCase())
      .filter((travee) => travee && travee !== "?"),
  );
  const unknownTravees = stores.filter((store) => !store.travee || store.travee === "?").length;
  return { travees: travees.size, score: stores.length + travees.size * 5 - unknownTravees * 3 };
}

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
  const quality = getReadQuality(stores);
  return stores.length < MIN_RELIABLE_PLAN_STORES || quality.travees < MIN_RELIABLE_PLAN_TRAVEES;
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

// Plages de travées sur les plans STAF (corrigé par le dispatch Pékin) :
//   - Craft  : 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 98  (un seul magasin par travée)
//   - Débord : 72-85 + DEB / DEB1-6
//   - Zone 1 : lettres seules (X, Y...), 99, 99BIS, 100+, 201+, 301+, 404, 803...
const CRAFT_TRAVEES = new Set(["86","87","88","89","90","91","92","93","94","95","96","98"]);

function isCraftTraveeToken(token: string): boolean {
  return CRAFT_TRAVEES.has(tokenDigits(token));
}

function inferZoneFromTravee(travee: string, fallbackZone: string, _explicitZoneOnLine = false): string {
  const t = String(travee || "").trim().toUpperCase();
  if (t.startsWith("DEB")) return "Débord";
  const digits = t.replace(/[^0-9]/g, "");
  if (CRAFT_TRAVEES.has(digits)) return "Craft";
  if (/^\d{2}$/.test(digits)) {
    const v = Number(digits);
    if (v >= 72 && v <= 85) return "Débord";
  }
  if (/^[A-WYZ]$/.test(t) || /^X$/.test(t) || /^\d{3,}$/.test(digits) || /^99BIS\d?$/.test(t)) return "Zone 1";
  return fallbackZone || "Zone 1";
}

function tokenizeLine(normalizedLine: string): string[] {
  return normalizedLine.match(/[A-Z0-9|]+/g) ?? [];
}

function isServiceToken(token: string): boolean {
  return /^(M|F|S|H)$/.test(token) || /^5H0{2}$/.test(token) || /^H0{2}$/.test(token) || /^DEB\d?$/.test(token);
}

function detectLineZone(normalizedLine: string, tokens: string[]): { zone: string | null; explicit: boolean; persistent: boolean } {
  for (const { pattern, zone } of ZONE_PATTERNS) {
    if (!pattern.test(normalizedLine)) continue;

    const isDebTraveeAtEnd = zone === "Débord" && tokens.some((token, index) => /^DEB\d?$/.test(token) && index > 0);
    if (isDebTraveeAtEnd) return { zone: null, explicit: false, persistent: false };

    const containsStores = tokens.some((_, index) => canReadStoreAt(tokens, index));
    const isStandaloneHeader = tokens.length <= 3 || !containsStores;

    return {
      zone,
      explicit: true,
      // Craft/Débord ne doivent pas contaminer toute la suite du plan quand
      // l'OCR les lit sur une ligne qui contient déjà des magasins.
      persistent: zone === "Zone 1" ? true : isStandaloneHeader,
    };
  }

  return { zone: null, explicit: false, persistent: false };
}

function isTraveeToken(token: string): boolean {
  if (/^(M|F|S|H)$/.test(token)) return false;

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

function tokenDigits(token: string): string {
  return normalizePotentialNumber(token).replace(/[^0-9]/g, "");
}

function isTrailingDebordTraveeToken(token: string): boolean {
  if (/^DEB\d?$/.test(token)) return true;
  const digits = tokenDigits(token);
  if (!/^\d{2}$/.test(digits)) return false;
  const value = Number(digits);
  return value >= 72 && value <= 85;
}

function readStoreEndingBefore(tokens: string[], endExclusive: number): { number: string; startIndex: number } | null {
  for (let startIndex = endExclusive - 1; startIndex >= Math.max(0, endExclusive - 3); startIndex -= 1) {
    const slice = tokens.slice(startIndex, endExclusive);
    if (slice.some((token) => isServiceToken(token) || isTraveeToken(token))) continue;
    const number = slice.map(tokenDigits).join("");
    if (/^\d{4,5}$/.test(number)) return { number, startIndex };
  }

  return null;
}

function readStoreEndingBeforeInRange(tokens: string[], startInclusive: number, endExclusive: number): { number: string; startIndex: number } | null {
  const min = Math.max(0, startInclusive);
  for (let cursor = endExclusive - 1; cursor >= min; cursor -= 1) {
    if (isServiceToken(tokens[cursor]) || isTraveeToken(tokens[cursor])) break;
    const digits = tokenDigits(tokens[cursor]);
    if (!digits) continue;

    let combined = digits;
    let startIndex = cursor;
    for (let left = cursor - 1; left >= min && combined.length < 5; left -= 1) {
      if (isServiceToken(tokens[left]) || isTraveeToken(tokens[left])) break;
      const leftDigits = tokenDigits(tokens[left]);
      if (!leftDigits) continue;
      if (leftDigits.length + combined.length > 5) break;
      combined = leftDigits + combined;
      startIndex = left;
      if (/^\d{4,5}$/.test(combined)) return { number: combined, startIndex };
    }

    if (/^\d{4,5}$/.test(combined)) return { number: combined, startIndex };
  }

  return null;
}

function readStoreStartingInRange(tokens: string[], startInclusive: number, endExclusive: number): { number: string; startIndex: number } | null {
  const max = Math.min(tokens.length, endExclusive);
  for (let cursor = Math.max(0, startInclusive); cursor < max; cursor += 1) {
    if (isServiceToken(tokens[cursor]) || isTraveeToken(tokens[cursor])) continue;
    const digits = tokenDigits(tokens[cursor]);
    if (!digits) continue;

    let combined = digits;
    for (let right = cursor + 1; right < max && combined.length < 5; right += 1) {
      if (isServiceToken(tokens[right]) || isTraveeToken(tokens[right])) break;
      const rightDigits = tokenDigits(tokens[right]);
      if (!rightDigits) continue;
      if (combined.length + rightDigits.length > 5) break;
      combined += rightDigits;
      if (/^\d{4,5}$/.test(combined)) return { number: combined, startIndex: cursor };
    }

    if (/^\d{4,5}$/.test(combined)) return { number: combined, startIndex: cursor };
  }

  return null;
}

function extractExplicitCraftEntries(tokens: string[]): LineStoreEntry[] {
  const craftAnchors = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => isCraftTraveeToken(token));

  return craftAnchors.flatMap((anchor, anchorIndex) => {
    const previousAnchorIndex = craftAnchors[anchorIndex - 1]?.index ?? -1;
    const nextAnchorIndex = craftAnchors[anchorIndex + 1]?.index ?? tokens.length;
    const after = readStoreStartingInRange(tokens, anchor.index + 1, nextAnchorIndex);
    const before = readStoreEndingBeforeInRange(tokens, previousAnchorIndex + 1, anchor.index);
    const store = after ?? before;
    return store ? [{ number: store.number, travee: anchor.token, zone: "Craft" }] : [];
  });
}

function extractTrailingDebordEntry(tokens: string[]): { entry: LineStoreEntry; remainingTokens: string[] } | null {
  if (tokens.length < 4) return null;

  const travee = tokens[tokens.length - 1];
  const quantity = tokens[tokens.length - 2];
  const service = tokens[tokens.length - 3];

  if (!isTrailingDebordTraveeToken(travee)) return null;
  // Si la ligne commence déjà par une travée Zone 1 et contient plusieurs
  // magasins, un DEB/DEB5 final lu par OCR peut être un libellé parasite :
  // on évite alors de voler le dernier magasin de Zone 1.
  if (/^DEB\d?$/.test(travee) && tokens.some((token, index) => index > 0 && /^(M|F|S)$/.test(token))) return null;
  if (!/^(M|F|S)$/.test(service)) return null;
  if (!/^\d{1,2}$/.test(tokenDigits(quantity))) return null;

  const store = readStoreEndingBefore(tokens, tokens.length - 3);
  if (!store) return null;

  return {
    entry: { number: store.number, travee, zone: "Débord" },
    remainingTokens: tokens.slice(0, store.startIndex),
  };
}

function canReadStoreAt(tokens: string[], index: number): boolean {
  if (index < 0 || index >= tokens.length) return false;
  if (isServiceToken(tokens[index])) return false;

  const digits = tokenDigits(tokens[index]);
  if (/^\d{4,5}$/.test(digits)) return true;
  if (!digits || digits.length >= 4) return false;
  if (index === 0 && isTraveeToken(tokens[index])) return false;

  let combined = digits;
  let cursor = index + 1;
  while (combined.length < 5 && cursor < tokens.length) {
    if (isServiceToken(tokens[cursor])) break;
    const nextDigits = tokenDigits(tokens[cursor]);
    if (isTraveeToken(tokens[cursor]) && !/^\d{1,3}$/.test(nextDigits)) break;
    if (!nextDigits || combined.length + nextDigits.length > 5) break;
    combined += nextDigits;
    if (/^\d{4,5}$/.test(combined)) return true;
    cursor += 1;
  }

  return false;
}

function hasReadableStoreAfter(tokens: string[], index: number): boolean {
  for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
    if (canReadStoreAt(tokens, cursor)) return true;
  }
  return false;
}

function isQuantityToken(tokens: string[], index: number): boolean {
  const digits = tokenDigits(tokens[index]);
  return /^\d{1,2}$/.test(digits) && (/^(M|F|S)$/.test(tokens[index - 1] ?? "") || /^(M|F|S)$/.test(tokens[index - 2] ?? ""));
}

function isLineTraveeAnchor(tokens: string[], index: number, explicitZoneOnLine: boolean): boolean {
  const token = tokens[index];
  if (!isTraveeToken(token)) return false;
  if (isQuantityToken(tokens, index)) return false;

  const hasStoreAfter = hasReadableStoreAfter(tokens, index);
  if (isCraftTraveeToken(token)) return hasStoreAfter;
  if (index === 0) return hasStoreAfter;
  if (!hasStoreAfter) return false;
  if (/^DEB\d?$/.test(token)) return false;
  if (explicitZoneOnLine && index <= 2) return true;

  const digits = tokenDigits(token);
  const previousDigits = tokenDigits(tokens[index - 1] ?? "");
  if (/^\d{4,5}$/.test(previousDigits)) return true;
  if (/^[A-Z]/.test(token)) return true;
  if (/^99BIS\d?$/.test(token)) return true;

  return false;
}

function extractLineStoreEntries(
  tokens: string[],
  currentTravee: string,
  explicitZoneOnLine: boolean,
  explicitZoneName: string | null = null,
): LineStoreEntry[] {
  const trailingDebord = extractTrailingDebordEntry(tokens);
  const workingTokens = trailingDebord?.remainingTokens ?? tokens;
  const explicitCraftEntries = explicitZoneName === "Craft" ? extractExplicitCraftEntries(workingTokens) : [];

  if (explicitCraftEntries.length) {
    return [...explicitCraftEntries, ...(trailingDebord ? [trailingDebord.entry] : [])];
  }

  const anchors = workingTokens
    .map((token, index) => ({ token, index }))
    .filter(({ index }) => isLineTraveeAnchor(workingTokens, index, explicitZoneOnLine));

  const debordEntries = trailingDebord ? [trailingDebord.entry] : [];

  if (!anchors.length) {
    return [
      ...extractStoreNumbers(workingTokens.join(" ")).map((number) => ({ number, travee: currentTravee || "?" })),
      ...debordEntries,
    ];
  }

  const anchoredEntries = anchors.flatMap((anchor, anchorIndex) => {
    const nextAnchorIndex = anchors[anchorIndex + 1]?.index ?? workingTokens.length;
    const segment = [anchor.token, ...workingTokens.slice(anchor.index + 1, nextAnchorIndex)].join(" ");
    return extractStoreNumbers(segment).map((number) => ({ number, travee: anchor.token }));
  });

  return [...anchoredEntries, ...debordEntries];
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

function chooseBestPlanRead(primaryStores: StoreData[], rawTextStores: StoreData[]): StoreData[] {
  if (!primaryStores.length) return rawTextStores;
  if (!rawTextStores.length) return primaryStores;

  const primaryQuality = getReadQuality(primaryStores);
  const rawQuality = getReadQuality(rawTextStores);
  const mergedStores = dedupeStores([...primaryStores, ...rawTextStores]);
  const mergedQuality = getReadQuality(mergedStores);

  if (mergedQuality.score >= Math.max(primaryQuality.score, rawQuality.score)) return mergedStores;
  return rawQuality.score > primaryQuality.score ? rawTextStores : primaryStores;
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

    const lineEntries = extractLineStoreEntries(tokens, currentTravee, explicitZoneOnLine, lineZone.zone);
    const lastLineTravee = [...lineEntries].reverse().find((entry) => !entry.zone)?.travee;

    if (lastLineTravee && lastLineTravee !== "?") {
      currentTravee = lastLineTravee;
    } else if (!lineEntries.length && !/ZONE\s*1/i.test(normalizedLine)) {
      currentTravee = extractTravee(normalizedLine, currentTravee);
    }

    for (const { number, travee, zone } of lineEntries) {
      const inferredZone = zone ?? inferZoneFromTravee(travee, lineZone.zone ?? currentZone, explicitZoneOnLine);
      stores.push({ number, travee, zone: inferredZone });
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
