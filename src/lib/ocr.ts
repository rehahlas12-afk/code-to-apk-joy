import Tesseract from "tesseract.js";
import type { StoreData } from "./store";

/**
 * Extract store numbers from a plan image using Tesseract.js OCR.
 * Parses the recognized text to find store numbers (4-5 digit codes)
 * and attempts to associate them with travées and zones.
 */
export async function ocrAnalyzePlan(
  imageData: string,
  onProgress?: (progress: number) => void
): Promise<StoreData[]> {
  const result = await Tesseract.recognize(imageData, "fra", {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  const text = result.data.text;
  console.log("OCR raw text:", text);

  return parseOcrText(text);
}

/**
 * Parse OCR text to extract store data.
 * Looks for patterns like:
 * - Store numbers: 4-5 digit codes (e.g., 10892, 9673)
 * - Travée numbers: 2-3 digit codes or special codes (99BIS, DEB, etc.)
 * - Zone indicators: Zone 1, Débord, Craft
 */
function parseOcrText(text: string): StoreData[] {
  const stores: StoreData[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let currentZone = "Zone 1";
  let currentTravee = "";

  // Patterns
  const storeNumberPattern = /\b(\d{4,5})\b/g;
  const traveePattern = /\b(99BIS\d?|DEB\d?|[1-9]\d{1,2})\b/gi;
  const zonePatterns: { pattern: RegExp; zone: string }[] = [
    { pattern: /d[eéè]bord/i, zone: "Débord" },
    { pattern: /craft/i, zone: "Craft" },
    { pattern: /zone\s*1/i, zone: "Zone 1" },
  ];

  for (const line of lines) {
    // Check for zone changes
    for (const { pattern, zone } of zonePatterns) {
      if (pattern.test(line)) {
        currentZone = zone;
        break;
      }
    }

    // Check for travée indicators
    const traveeMatch = line.match(traveePattern);
    if (traveeMatch) {
      // Use the first travée-like number found
      const candidate = traveeMatch[0].toUpperCase();
      // Only update travée if it looks like a travée (not a store number)
      if (
        candidate.startsWith("DEB") ||
        candidate.startsWith("99BIS") ||
        candidate.length <= 3
      ) {
        currentTravee = candidate;
      }
    }

    // Extract store numbers
    let match: RegExpExecArray | null;
    const lineNumbers: string[] = [];
    const tempPattern = new RegExp(storeNumberPattern.source, "g");
    while ((match = tempPattern.exec(line)) !== null) {
      lineNumbers.push(match[1]);
    }

    // Heuristic: if a line has multiple numbers, first short one might be travée
    if (lineNumbers.length >= 2) {
      const first = lineNumbers[0];
      if (first.length <= 3) {
        currentTravee = first;
        lineNumbers.shift();
      }
    }

    for (const num of lineNumbers) {
      // Skip numbers that are likely travées (1-3 digits) unless they're big store numbers
      if (num.length >= 4) {
        stores.push({
          number: num,
          travee: currentTravee || "?",
          zone: currentZone,
        });
      }
    }
  }

  // Deduplicate by number+travee
  const seen = new Set<string>();
  return stores.filter((s) => {
    const key = `${s.number}-${s.travee}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
