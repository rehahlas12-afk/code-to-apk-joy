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

    // First token that looks like a travée (2-3 digits, DEB*, 99BIS*, or single letter like X)
    let travee = "";
    let storeStart = 0;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i].toUpperCase();
      const n = parseInt(t, 10);
      const isNumericTravee = !isNaN(n) && t.length >= 2 && t.length <= 3 && n >= 10 && n <= 999;
      const isDebTravee = /^DEB\d*$/.test(t);
      const is99Bis = /^99BIS\d*$/.test(t);
      const isSingleLetter = t === "X"; // travée nommée X
      if (isNumericTravee || isDebTravee || is99Bis || isSingleLetter) {
        travee = t;
        storeStart = i + 1;
        break;
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

Le plan a TROIS zones distinctes — ne jamais mélanger leurs travées :

ZONE 1 (tableau principal vertical, lu de gauche à droite) :
- Colonne 1 = TRAVÉE : nombre 2-3 chiffres (99, 100, 201, 306...), 99BIS/99BIS1/99BIS2/99BIS3, ou la lettre X (travée indépendante placée entre 306 et 401)
- Colonnes suivantes = MAGASINS : 4 ou 5 chiffres (ex: 7879, 10032). Peut avoir 1 ou 2 magasins par travée.

ZONE CRAFT (travées 86 à 98, section séparée du plan) :
- Disposition en COLONNES : chaque colonne = une travée indépendante
- En haut de la colonne : le numéro de travée (ex: 86, 87, 88...)
- En bas de la même colonne : le numéro de magasin (4-5 chiffres)
- ATTENTION : les colonnes sont ordonnées du numéro LE PLUS GRAND à gauche vers le numéro LE PLUS PETIT à droite (ex: 98...88 87 86 de gauche à droite). Chaque magasin appartient à la colonne dont il partage le numéro de travée EN HAUT — ne pas décaler d'une colonne.
- Un seul magasin par colonne/travée. Transcris chaque colonne séparément : "86 MAGASIN", "87 MAGASIN", etc.

ZONE DÉBORD (travées DEB1, DEB2... ou numéros 72 à 85, section séparée) :
- Disposition VERTICALE mais lue de droite à gauche : travée à DROITE, magasin à GAUCHE
- Un seul magasin par travée. Transcris : "DEB1 MAGASIN", "72 MAGASIN", etc.

RÈGLES GÉNÉRALES :
- Ignore : heures (5H00), M, S, nombres 1-2 chiffres (palettes), flèches →
- Si tu lis mal un chiffre, transcris quand même ton meilleur essai
- Lis chaque section complètement, sans sauter aucune ligne

Exemple :
DEB1 9812
DEB2 11839
99BIS 7450
99BIS1 8060
99 8999
100 7450
103 8176 6317
86 8214
87 7879
88 10032
89 9571
306 10892
X 9037
402 9668 9684
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
