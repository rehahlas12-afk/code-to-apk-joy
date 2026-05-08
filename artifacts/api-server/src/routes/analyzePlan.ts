import { Router } from "express";

const router = Router();

interface StoreData {
  number: string;
  travee: string;
  zone: string;
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

    const prompt = `Tu es un expert OCR spécialisé dans les plans de dispatch entrepôt STAF Transport.

MISSION : Lire TOUTES les lignes du tableau et extraire CHAQUE numéro de magasin visible. Il peut y avoir entre 40 et 80 magasins. Ne t'arrête pas avant d'avoir lu TOUT le tableau jusqu'à la dernière ligne.

FORMAT DU TABLEAU — chaque ligne a ces colonnes :
  1. TRAVÉE : nombre à 2-3 chiffres (ex: 99, 101, 202, 306, 401, 504, 801). Parfois "x" ou une flèche "→" = ignorer cette ligne.
  2. HEURE : ex "5H00", "6H00" → ignorer
  3. N° MAGASIN 1 : nombre à 4 ou 5 chiffres (ex: 7922, 8214, 9673, 10297, 11964) → À EXTRAIRE
  4. Lettre "M" ou "S" → ignorer
  5. Palettes : 1 ou 2 chiffres (ex: 8, 14, 25) → ignorer — NE PAS confondre avec un magasin
  6. N° MAGASIN 2 (optionnel) : autre nombre à 4-5 chiffres → À EXTRAIRE si présent
  7. Lettre "M" ou "S" → ignorer
  8. Palettes → ignorer

RÈGLES ABSOLUES :
- Les numéros de MAGASINS ont TOUJOURS 4 ou 5 chiffres
- Les numéros de TRAVÉES ont 2-3 chiffres → ce ne sont PAS des magasins
- Les PALETTES ont 1-2 chiffres → ce ne sont PAS des magasins
- Lis TOUTES les sections du tableau (haut, milieu, bas) sans exception
- Chaque ligne valide donne 1 ou 2 magasins à extraire
- N'invente rien — extrait uniquement ce qui est écrit sur le plan

ZONES à attribuer automatiquement :
- zone "Débord" : si travée entre 72 et 85, ou DEB1 à DEB5
- zone "Craft" : si travée entre 86 et 98
- zone "Zone 1" : tout le reste

Retourne UNIQUEMENT du JSON valide, sans markdown ni texte avant ou après :
{"stores":[{"number":"7922","travee":"602","zone":"Zone 1"},{"number":"9673","travee":"603","zone":"Zone 1"},{"number":"9684","travee":"603","zone":"Zone 1"}]}`;

    const body = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.0,
        maxOutputTokens: 8192,
      },
    };

    // Use gemini-2.5-pro for better accuracy on complex dense tables
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

    req.log.info({ rawTextLength: rawText.length, finishReason }, "Gemini raw response received");

    // Extract JSON — handle cases where response might be wrapped in markdown
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      req.log.error({ rawText: rawText.slice(0, 500) }, "No JSON found in Gemini response");
      res.status(502).json({ error: "Could not parse AI response" });
      return;
    }

    let parsed: { stores?: StoreData[] };
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      // Try to recover truncated JSON by closing arrays/objects
      let partial = jsonMatch[0];
      // Close any open array and object
      const openBrackets = (partial.match(/\[/g) ?? []).length - (partial.match(/\]/g) ?? []).length;
      const openBraces = (partial.match(/\{/g) ?? []).length - (partial.match(/\}/g) ?? []).length;
      // Remove trailing incomplete entry (ends with comma or partial object)
      partial = partial.replace(/,\s*\{[^}]*$/, "");
      for (let i = 0; i < openBrackets; i++) partial += "]";
      for (let i = 0; i < openBraces; i++) partial += "}";
      try {
        parsed = JSON.parse(partial);
        req.log.warn({ finishReason }, "Recovered from truncated JSON response");
      } catch {
        req.log.error({ rawText: rawText.slice(0, 500) }, "Failed to parse even recovered JSON");
        res.status(502).json({ error: "Could not parse AI response" });
        return;
      }
    }

    const stores: StoreData[] = (parsed.stores ?? [])
      .map((s) => ({
        number: String(s.number ?? "").trim(),
        travee: String(s.travee ?? "").trim(),
        zone: String(s.zone ?? "Zone 1").trim(),
      }))
      .filter((s) => s.number && s.travee && /^\d{4,5}$/.test(s.number));

    req.log.info({ count: stores.length, finishReason }, "AI plan analysis complete");
    res.json({ stores });
  } catch (err) {
    req.log.error({ err }, "analyze-plan route error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
