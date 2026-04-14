import Tesseract from "tesseract.js";
import type { StoreData } from "./store";

const OCR_DIGIT_FIXES: Record<string, string> = {
  O: "0",
  Q: "0",
  D: "0",
  I: "1",
  L: "1",
  "|": "1",
  Z: "2",
  S: "5",
  B: "8",
  G: "6",
};

const ZONE_PATTERNS: { pattern: RegExp; zone: string }[] = [
  { pattern: /DEBORD/i, zone: "Débord" },
  { pattern: /CRAFT/i, zone: "Craft" },
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
    .replace(/[’']/g, "")
    .replace(/(\d)[,;:./\\-]+(?=\d)/g, "$1");
}

function normalizePotentialNumber(token: string): string {
  return token
    .split("")
    .map((char) => OCR_DIGIT_FIXES[char] ?? char)
    .join("");
}

function inferZoneFromTravee(travee: string, fallbackZone: string): string {
  if (travee.startsWith("DEB")) return "Débord";

  const traveeNumber = Number(travee);
  if (Number.isNaN(traveeNumber)) return fallbackZone;
  if (traveeNumber >= 72 && traveeNumber <= 85) return "Débord";
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
    if (i === 0 && isTraveeToken(tokens[i])) {
      continue;
    }

    const normalizedToken = normalizePotentialNumber(tokens[i]).replace(/[^0-9]/g, "");
    if (!normalizedToken) {
      continue;
    }

    if (/^\d{4,5}$/.test(normalizedToken)) {
      storeNumbers.add(normalizedToken);
      continue;
    }

    if (normalizedToken.length >= 4) {
      continue;
    }

    let combined = normalizedToken;
    let cursor = i + 1;

    while (combined.length < 5 && cursor < tokens.length) {
      const nextToken = normalizePotentialNumber(tokens[cursor]).replace(/[^0-9]/g, "");

      if (!nextToken || combined.length + nextToken.length > 5) {
        break;
      }

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

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Impossible de charger l'image du plan"));
    image.src = src;
  });
}

async function preprocessPlanImage(imageData: string): Promise<string> {
  const image = await loadImage(imageData);
  const scale = image.width < 1600 ? 2 : 1.35;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas OCR indisponible");

  ctx.drawImage(image, 0, 0, width, height);

  const frame = ctx.getImageData(0, 0, width, height);
  const contrast = 1.4;
  const threshold = 168;

  for (let i = 0; i < frame.data.length; i += 4) {
    const gray = frame.data[i] * 0.299 + frame.data[i + 1] * 0.587 + frame.data[i + 2] * 0.114;
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * contrast + 128));
    const value = contrasted > threshold ? 255 : 0;

    frame.data[i] = value;
    frame.data[i + 1] = value;
    frame.data[i + 2] = value;
  }

  ctx.putImageData(frame, 0, 0);
  return canvas.toDataURL("image/png");
}

async function recognizeText(
  imageData: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const result = await Tesseract.recognize(imageData, "fra", {
    langPath: "/tessdata",
    logger: (message) => {
      if (message.status === "recognizing text") {
        onProgress?.(message.progress);
      }
    },
  });

  return result.data.text;
}

/**
 * Extract store numbers from a plan image using Tesseract.js OCR.
 * Parses the recognized text to find store numbers (4-5 digit codes)
 * and attempts to associate them with travées and zones.
 */
export async function ocrAnalyzePlan(
  imageData: string,
  onProgress?: (progress: number) => void
): Promise<StoreData[]> {
  const primaryText = await recognizeText(imageData, (progress) => {
    onProgress?.(Math.round(progress * 70));
  });

  const primaryStores = parseOcrText(primaryText);
  console.log("OCR raw text:", primaryText);

  if (primaryStores.length >= 12) {
    onProgress?.(100);
    return primaryStores;
  }

  try {
    const processedImage = await preprocessPlanImage(imageData);
    const enhancedText = await recognizeText(processedImage, (progress) => {
      onProgress?.(70 + Math.round(progress * 30));
    });

    console.log("OCR enhanced text:", enhancedText);
    onProgress?.(100);

    return dedupeStores([...primaryStores, ...parseOcrText(enhancedText)]);
  } catch (error) {
    console.warn("OCR enhanced pass failed:", error);
    onProgress?.(100);
    return primaryStores;
  }
}

/**
 * Parse OCR text to extract store data.
 * Looks for patterns like:
 * - Store numbers: 4-5 digit codes (e.g., 10892, 9673)
 * - Travée numbers: 2-3 digit codes or special codes (99BIS, DEB, etc.)
 * - Zone indicators: Zone 1, Débord, Craft
 */
export function parseOcrText(text: string): StoreData[] {
  const stores: StoreData[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let currentZone = "Zone 1";
  let currentTravee = "";

  for (const line of lines) {
    const normalizedLine = normalizeOcrLine(line);

    for (const { pattern, zone } of ZONE_PATTERNS) {
      if (pattern.test(normalizedLine)) {
        currentZone = zone;
        break;
      }
    }

    currentTravee = extractTravee(normalizedLine, currentTravee);
    const inferredZone = inferZoneFromTravee(currentTravee, currentZone);
    const lineNumbers = extractStoreNumbers(normalizedLine);

    for (const num of lineNumbers) {
      stores.push({
        number: num,
        travee: currentTravee || "?",
        zone: inferredZone,
      });
    }
  }

  return dedupeStores(stores);
}
