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

/** Parse plain-text transcription into store records */
function parseTranscription(text: string): StoreData[] {
  const stores: StoreData[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    // Extract all tokens
    const tokens = line.match(/[A-Z0-9]+/gi) ?? [];
    if (tokens.length === 0) continue;

    // First token that looks like a travée (2-3 digits, DEB*, 99BIS*)
    let travee = "";
    let storeStart = 0;
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
    if (!travee) continue;

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
    const prompt = `Tu es un expert OCR spécialisé dans les tableaux de dispatch entrepôt.

MISSION : Extraire ABSOLUMENT TOUS les numéros de magasin (4-5 chiffres) de ce plan.
Il y a probablement entre 50 et 80 lignes — tu DOIS toutes les transcrire sans en sauter une seule.

Format de sortie : une ligne par rangée du tableau :
TRAVÉE MAGASIN1 [MAGASIN2]

Définitions :
- TRAVÉE = nombre à 2-3 chiffres (ex: 72, 101, 306, 504) OU DEB1 OU 99BIS
- MAGASIN = nombre à 4 ou 5 chiffres (ex: 7879, 10032, 8486)
- Ignore : heures (ex: 5H00, 6H30), lettres M/S, nombres de palettes (1-2 chiffres max)

Règles critiques :
1. TOUTES les lignes du tableau, du haut jusqu'en bas, sans exception
2. Si une travée a 2 magasins, mets les 2 sur la même ligne
3. Si tu n'es pas sûr d'un chiffre, transcris quand même ton meilleur essai
4. Ne regroupe PAS plusieurs lignes ensemble
5. Ne saute AUCUNE ligne même si elle te semble incomplète

Exemple :
72 8214
101 6059
102 8060 10297
306 11964 8999
504 7878 7450

Transcris maintenant TOUTES les lignes, du début à la fin du tableau :`;

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
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
    };

    const candidate = geminiData.candidates?.[0];
    const rawText = candidate?.content?.parts?.[0]?.text ?? "";
    const finishReason = candidate?.finishReason ?? "unknown";

    req.log.info({ rawTextLength: rawText.length, finishReason, rawText }, "Gemini transcription received");

    // Step 2: Parse the plain-text transcription
    const stores = parseTranscription(rawText);

    req.log.info({ count: stores.length, finishReason }, "Plan analysis complete");
    res.json({ stores });
  } catch (err) {
    req.log.error({ err }, "analyze-plan route error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
