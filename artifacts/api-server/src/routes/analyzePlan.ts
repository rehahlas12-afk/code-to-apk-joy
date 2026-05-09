import { Router } from "express";

const router = Router();

interface StoreData {
  number: string;
  travee: string;
  zone: string;
}

/** Zone rules */
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

/** Normalize a raw line before parsing:
 *  - "99 BIS 2"   → "99BIS2"
 *  - "99 BIS"     → "99BIS"
 *  - "DEB 1"      → "DEB1"
 *  - "99 bis 3"   → "99BIS3" (case-insensitive)
 */
function normalizeLine(line: string): string {
  return line
    .toUpperCase()
    .replace(/\b99\s+BIS\s*(\d*)\b/g, (_, d) => `99BIS${d}`)
    .replace(/\bDEB\s*(\d+)\b/g, (_, d) => `DEB${d}`);
}

/** Parse plain-text transcription into store records */
function parseTranscription(text: string): StoreData[] {
  const stores: StoreData[] = [];
  const seen = new Set<string>();
  let lastTravee = "";

  for (const rawLine of text.split("\n")) {
    const line = normalizeLine(rawLine.trim());
    if (!line) continue;

    // Extract all tokens
    const tokens = line.match(/[A-Z0-9]+/gi) ?? [];
    if (tokens.length === 0) continue;

    // Check if first token is "X" → use last known travée (same row as above)
    let travee = "";
    let storeStart = 0;
    const firstToken = tokens[0].toUpperCase();

    if (firstToken === "X" && lastTravee) {
      travee = lastTravee;
      storeStart = 1;
    } else {
      // First token that looks like a travée (2-3 digits, DEB*, 99BIS*)
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i].toUpperCase();
        const n = parseInt(t, 10);
        const isNumericTravee = !isNaN(n) && t.length >= 2 && t.length <= 3 && n >= 10 && n <= 999;
        const isDebTravee = /^DEB\d*$/.test(t);
        const is99Bis = /^99BIS\d*$/.test(t);
        if (isNumericTravee || isDebTravee || is99Bis) {
          travee = t;
          storeStart = i + 1;
          break;
        }
      }
    }

    if (!travee) continue;
    lastTravee = travee;

    // Find all 4-5 digit numbers after the travée
    for (let i = storeStart; i < tokens.length; i++) {
      const tok = tokens[i].replace(/[^0-9]/g, "");
      if (/^\d{4,5}$/.test(tok)) {
        const key = `${travee}-${tok}`;
        if (!seen.has(key)) {
          seen.add(key);
          stores.push({ number: tok, travee, zone: inferZone(travee) });
        }
      }
    }
  }

  return stores;
}

router.post("/analyze-plan", async (req, res) => {
  const { imageBase64 } = req.body as { imageBase64?: string };

  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }

  const geminiBaseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const geminiApiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

  if (!geminiBaseUrl || !geminiApiKey) {
    res.status(503).json({ error: "AI analysis not configured" });
    return;
  }

  try {
    const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");

    // Step 1: Ask Gemini to transcribe the table as plain text — simpler = more complete
    const prompt = `Tu es un expert OCR. Ce document est un tableau de dispatch entrepôt.

Extrait TOUS les nombres à 4 ou 5 chiffres (numéros de magasin) et leur travée associée.

FORMAT DE SORTIE — une ligne par rangée du tableau :
TRAVÉE MAGASIN1 MAGASIN2

Colonne 1 = TRAVÉE : peut être un nombre (99, 100, 201...), DEB1/DEB2/DEB3, 99BIS/99BIS1/99BIS2/99BIS3
Colonnes suivantes = MAGASINS : nombres à 4 ou 5 chiffres UNIQUEMENT (ex: 7879, 10032, 8486)

IMPORTANT :
- Les lignes DEB et 99BIS en HAUT du tableau ont aussi des magasins — lis-les attentivement
- Si la colonne travée contient "x" ou "×" ou "X" → utilise la MÊME travée que la ligne précédente
- Ignore : heures (5H00), M, S, nombres 1-2 chiffres (palettes), flèches →
- Si tu lis mal un chiffre, transcris quand même ton meilleur essai
- Lis de haut en bas sans sauter aucune ligne

Exemple :
DEB1 9812
DEB2 11839
99BIS 7450
99BIS1 8060
99BIS2 9738
99 8999
100 7450
103 8176 6317
202 6243 7389
402 9668 9684 11754
504 7878 7450

Transcris maintenant :`;

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: base64Data } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.0,
        maxOutputTokens: 32768,
      },
    };

    const url = `${geminiBaseUrl}/models/gemini-2.5-pro:generateContent?key=${geminiApiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      req.log.error({ status: response.status, body: errText }, "Gemini API error");
      res.status(502).json({ error: "AI service error" });
      return;
    }

    const geminiData = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    };

    const candidate = geminiData.candidates?.[0];
    const rawText = candidate?.content?.parts?.[0]?.text ?? "";
    const finishReason = candidate?.finishReason ?? "unknown";

    req.log.info({ rawTextLength: rawText.length, finishReason, rawText }, "Gemini transcription received");

    const stores = parseTranscription(rawText);

    req.log.info({ count: stores.length, finishReason }, "Plan analysis complete");
    res.json({ stores });
  } catch (err) {
    req.log.error({ err }, "analyze-plan route error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
