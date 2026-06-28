import { Router } from "express";

const router = Router();

interface StoreData {
  number: string;
  travee: string;
  zone: string;
}

/** Zone rules — fallback only, Gemini output takes priority */
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

/** Parse plain-text transcription into store records.
 *  Each line may start with an explicit zone prefix: ZONE1, CRAFT, or DEBORD.
 *  If present, the prefix takes priority over inferZone().
 *  Example lines:
 *    ZONE1 306 10892
 *    CRAFT 86 8214
 *    DEBORD 86 9684
 *    DEBORD DEB1 9812
 */
function parseTranscription(text: string): StoreData[] {
  const stores: StoreData[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split("\n")) {
    const line = normalizeLine(rawLine.trim());
    if (!line) continue;

    const tokens = line.match(/[A-Z0-9]+/gi) ?? [];
    if (tokens.length === 0) continue;

    // Detect optional explicit zone prefix as first token
    let explicitZone: string | null = null;
    let scanStart = 0;
    const first = tokens[0].toUpperCase();
    if (first === "ZONE1" || first === "Z1") { explicitZone = "Zone 1"; scanStart = 1; }
    else if (first === "CRAFT") { explicitZone = "Craft"; scanStart = 1; }
    else if (first === "DEBORD" || first === "DÉBORD") { explicitZone = "Débord"; scanStart = 1; }

    // Find travée token (2-3 digits, DEB*, 99BIS*, or X)
    let travee = "";
    let storeStart = scanStart;

    for (let i = scanStart; i < tokens.length; i++) {
      const t = tokens[i].toUpperCase();
      const n = parseInt(t, 10);
      const isNumericTravee = !isNaN(n) && t.length >= 2 && t.length <= 3 && n >= 10 && n <= 999;
      const isDebTravee = /^DEB\d*$/.test(t);
      const is99Bis = /^99BIS\d*$/.test(t);
      const isSingleLetter = t === "X";
      if (isNumericTravee || isDebTravee || is99Bis || isSingleLetter) {
        travee = t;
        storeStart = i + 1;
        break;
      }
    }

    if (!travee) continue;

    const zone = explicitZone ?? inferZone(travee);

    // Find all 4-5 digit store numbers after the travée
    for (let i = storeStart; i < tokens.length; i++) {
      const tok = tokens[i].replace(/[^0-9]/g, "");
      if (/^\d{4,5}$/.test(tok)) {
        const key = `${zone}|${travee}|${tok}`;
        if (!seen.has(key)) {
          seen.add(key);
          stores.push({ number: tok, travee, zone });
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
  const replitKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  // User can provide their own key via x-gemini-api-key header (takes priority)
  const userKey = (req.headers["x-gemini-api-key"] as string | undefined)?.trim();
  const geminiApiKey = userKey || replitKey;

  if (!geminiBaseUrl || !geminiApiKey) {
    res.status(503).json({ error: "AI analysis not configured — ajoutez une clé API Gemini dans les paramètres." });
    return;
  }

  // When using a user key, call Google AI directly (not through Replit proxy)
  const effectiveBaseUrl = userKey
    ? "https://generativelanguage.googleapis.com/v1beta"
    : geminiBaseUrl;

  try {
    const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");

    const prompt = `Tu es un expert OCR. Ce document est un tableau de dispatch entrepôt.

Extrait TOUS les nombres à 4 ou 5 chiffres (numéros de magasin) et leur travée associée.

FORMAT DE SORTIE — une ligne par entrée, avec OBLIGATOIREMENT le préfixe de zone :
ZONE1 TRAVÉE MAGASIN1 [MAGASIN2]
CRAFT TRAVÉE MAGASIN
DEBORD TRAVÉE MAGASIN

IMPORTANT : Le même numéro (ex: 86) peut apparaître à la fois dans la zone CRAFT ET dans la zone DÉBORD sur le même plan. Tu dois identifier dans quelle section physique du plan tu lis chaque entrée et mettre le bon préfixe.

Le plan a TROIS zones physiquement séparées :

ZONE 1 (tableau principal vertical, lu de gauche à droite) → préfixe ZONE1 :
- Colonne 1 = TRAVÉE : nombre 2-3 chiffres (99, 100, 201, 306...), 99BIS/99BIS1/99BIS2/99BIS3, ou la lettre X
- Colonnes suivantes = MAGASINS : 4 ou 5 chiffres. Peut avoir 1 ou 2 magasins par travée.

ZONE CRAFT (section horizontale séparée, travées 86 à 98) → préfixe CRAFT :
- Disposition en COLONNES : chaque colonne = une travée indépendante
- En haut de la colonne : le numéro de travée (ex: 86, 87, 88...)
- En bas de la même colonne : le numéro de magasin (4-5 chiffres)
- Les colonnes vont du numéro LE PLUS GRAND à gauche vers le PLUS PETIT à droite (ex: 98...88 87 86)
- Chaque magasin appartient à la colonne dont il partage le numéro de travée EN HAUT — ne pas décaler d'une colonne.

ZONE DÉBORD (section verticale séparée, travées DEB1/DEB2... ou 72-85 et parfois 86+) → préfixe DEBORD :
- Disposition VERTICALE lue de droite à gauche : travée à DROITE, magasin à GAUCHE
- Un seul magasin par travée.

RÈGLES :
- Ignore : heures (5H00), M, S, nombres 1-2 chiffres (palettes), flèches →
- Lis chaque section complètement, sans sauter aucune ligne

Exemple de sortie :
DEBORD DEB1 9812
DEBORD DEB2 11839
DEBORD 86 9684
CRAFT 86 8214
CRAFT 87 7879
CRAFT 88 10032
ZONE1 99BIS 7450
ZONE1 99BIS1 8060
ZONE1 99 8999
ZONE1 100 7450
ZONE1 103 8176 6317
ZONE1 306 10892
ZONE1 X 9037
ZONE1 402 9668

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

    const url = `${effectiveBaseUrl}/models/gemini-2.5-pro:generateContent?key=${geminiApiKey}`;

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
