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

    const prompt = `Tu es un lecteur expert de plans de dispatch entrepôt STAF Transport (France).

Le plan est un TABLEAU avec ces colonnes dans cet ordre :
  Col 1 : TRAVÉE (2-3 chiffres ex: 306, 401, 504 — ou "x" ou "→" à ignorer)
  Col 2 : HEURE (ex: 5H00, 6H00 — à ignorer)
  Col 3 : N° MAGASIN 1 (4 ou 5 chiffres ex: 8214, 10297, 11964)
  Col 4 : lettre M ou S (à ignorer)
  Col 5 : nombre de palettes (1-2 chiffres — à ignorer)
  Col 6 : N° MAGASIN 2 (optionnel, 4 ou 5 chiffres — présent si la travée a 2 magasins)
  Col 7 : lettre M ou S (à ignorer)
  Col 8 : nombre de palettes (à ignorer)

RÈGLES IMPORTANTES :
- Les lignes avec "x" ou "→" en colonne 1 sont des répétitions ou séparateurs — IGNORE-LES complètement
- Les numéros de MAGASINS font toujours EXACTEMENT 4 ou 5 chiffres
- Ne confonds PAS les numéros de palettes (1-2 chiffres) avec les numéros de magasins (4-5 chiffres)
- Ne confonds PAS les numéros de travées (2-3 chiffres) avec les numéros de magasins (4-5 chiffres)
- Extrait UNIQUEMENT ce qui est écrit — n'invente rien

ZONES :
- "Débord" : travées 72 à 85, ou DEB1 à DEB5
- "Craft" : travées 86 à 98
- "Zone 1" : toutes les autres travées (99, 99BIS, 101–803)

Retourne UNIQUEMENT du JSON valide, sans markdown ni texte autour :
{"stores": [{"number": "8214", "travee": "306", "zone": "Zone 1"}, {"number": "8060", "travee": "402", "zone": "Zone 1"}, {"number": "10297", "travee": "402", "zone": "Zone 1"}, ...]}`;

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
        temperature: 0.05,
        maxOutputTokens: 8192,
      },
    };

    const url = `${geminiBaseUrl}/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

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
      }>;
    };

    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      req.log.error({ rawText }, "No JSON found in Gemini response");
      res.status(502).json({ error: "Could not parse AI response" });
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]) as { stores?: StoreData[] };
    const stores: StoreData[] = (parsed.stores ?? [])
      .map((s) => ({
        number: String(s.number ?? "").trim(),
        travee: String(s.travee ?? "").trim(),
        zone: String(s.zone ?? "Zone 1").trim(),
      }))
      .filter((s) => s.number && s.travee && /^\d{4,5}$/.test(s.number));

    req.log.info({ count: stores.length }, "AI plan analysis complete");
    res.json({ stores });
  } catch (err) {
    req.log.error({ err }, "analyze-plan route error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
