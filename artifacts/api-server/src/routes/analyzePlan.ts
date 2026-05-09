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

  for (const rawLine of text.split("\n")) {
    const line = normalizeLine(rawLine.trim());
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

MISSION CRITIQUE : Lire CHAQUE ligne du tableau de haut en bas et extraire tous les numéros de magasin.
Le tableau a environ 60-70 lignes. Tu DOIS toutes les traiter sans en sauter une seule.

Format de sortie STRICT — une ligne par rangée :
TRAVÉE MAGASIN1 [MAGASIN2]

Définitions :
- TRAVÉE = identifiant en colonne 1 :
  * Nombre 2-3 chiffres : 72, 99, 100, 101, 201, 306, 504, 803...
  * Débord : DEB1, DEB2, DEB3... (écris-les comme ça, sans espace)
  * Spécial : 99BIS, 99BIS1, 99BIS2, 99BIS3 (sans espace)
- MAGASIN = nombre à 4 ou 5 chiffres dans les colonnes suivantes (ex: 7879, 10032, 8486, 11754)
- IGNORER : heures (5H00, 6H30), lettres M/S, palettes (1 ou 2 chiffres), flèches →, croix x

Règles absolues :
1. Commence depuis la PREMIÈRE ligne du tableau et va jusqu'à la DERNIÈRE
2. Chaque ligne du tableau = une ligne dans ta réponse
3. Si une travée a 2 magasins → mets les 2 sur la même ligne
4. Si une ligne a une travée mais tu ne vois pas clairement le magasin → écris quand même la travée seule
5. Sections DEB (Débord) et 99BIS en haut du tableau : ne les saute pas

Exemple de sortie :
DEB1 8214
DEB2 6059 9812
99BIS 7450
99BIS1 8060
99 9738
100 8999
102 7450
103 8176 6317
201 8484 9616
401 7518
402 9668 9684
504 7878 7450

Commence maintenant — transcris TOUTES les lignes de haut en bas :`;

    const makeBody = (p: string) => ({
      contents: [
        {
          role: "user",
          parts: [
            { text: p },
            { inline_data: { mime_type: "image/jpeg", data: base64Data } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.0,
        maxOutputTokens: 32768,
      },
      thinkingConfig: { thinkingBudget: 8000 },
    });

    const url = `${geminiBaseUrl}/models/gemini-2.5-pro:generateContent?key=${geminiApiKey}`;

    const callGemini = async (p: string): Promise<{ text: string; finishReason: string }> => {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeBody(p)),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        req.log.error({ status: resp.status, body: errText }, "Gemini API error");
        throw new Error(`Gemini error ${resp.status}`);
      }
      const data = await resp.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      };
      const cand = data.candidates?.[0];
      // thinking model returns multiple parts; grab the last non-empty text part
      const parts = cand?.content?.parts ?? [];
      const text = [...parts].reverse().find(p => p.text?.trim())?.text ?? "";
      return { text, finishReason: cand?.finishReason ?? "unknown" };
    };

    // Pass 1 — full table
    const pass1 = await callGemini(prompt);
    req.log.info({ rawTextLength: pass1.text.length, finishReason: pass1.finishReason, rawText: pass1.text }, "Gemini pass1");

    // Pass 2 — focused on DEB / 99BIS section at top of plan
    const promptDeb = `Ce plan contient une section en haut avec des travées Débord (DEB1, DEB2, DEB3...) et 99BIS.
Ces lignes ont des numéros de magasin à 4-5 chiffres que tu dois lire.

Lis UNIQUEMENT la section du haut du tableau (DEB et 99BIS) et transcris chaque ligne :
DEB1 MAGASIN
DEB2 MAGASIN
99BIS MAGASIN
99BIS1 MAGASIN
etc.

Si tu ne vois pas de section DEB, réponds simplement : AUCUN`;
    const pass2 = await callGemini(promptDeb);
    req.log.info({ rawTextLength: pass2.text.length, rawText: pass2.text }, "Gemini pass2 (DEB section)");

    // Merge both passes
    const combined = pass1.text + "\n" + (pass2.text.trim() === "AUCUN" ? "" : pass2.text);
    const stores = parseTranscription(combined);

    req.log.info({ count: stores.length }, "Plan analysis complete");
    res.json({ stores });
  } catch (err) {
    req.log.error({ err }, "analyze-plan route error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
