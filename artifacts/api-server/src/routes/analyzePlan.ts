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

    const prompt = `Tu es un lecteur expert de plans de dispatch entrepôt français (STAF Transport).

Analyse cette image d'un plan de travail et extrais UNIQUEMENT les données écrites sur le plan — n'invente rien.

FORMAT DU PLAN :
- Chaque ligne contient : NUMÉRO_TRAVÉE  MAGASIN1  MAGASIN2  ...
- Le numéro de TRAVÉE est toujours le PREMIER élément de la ligne (2 à 3 chiffres, parfois avec une lettre : 101, 306X, 99BIS, DEB1…)
- Les numéros de MAGASINS viennent après le numéro de travée
- Les numéros de magasins font exactement 4 ou 5 chiffres (exemples : 9673, 10892, 8214, 11843)
- Ne confonds PAS les numéros de travées avec les numéros de magasins

TYPES DE TRAVÉES ET ZONES :
1. Zone 1 : travées 99BIS, 99BIS1, 99BIS2, 99BIS3, 99, 101–104, 201–204, 301–306X, 401–404, 501–504, 601–604, 701–704, 801–803
   → Peuvent contenir 1, 2, 3 ou 4 magasins

2. Débord (zone = "Débord") : travées 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85 et DEB1, DEB2, DEB3, DEB4, DEB5
   → Contiennent exactement 1 magasin

3. Craft (zone = "Craft") : travées 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98
   → Contiennent exactement 1 magasin

RÈGLES STRICTES :
- Extrait UNIQUEMENT les magasins visibles sur le plan — pas d'invention
- Les numéros de magasins sont toujours 4 ou 5 chiffres
- Si plusieurs magasins sont sur la même travée, liste-les tous séparément avec la même travée
- Ignore les titres, en-têtes et textes non pertinents

Retourne UNIQUEMENT du JSON valide sans aucun texte ni markdown autour :
{"stores": [{"number": "9673", "travee": "101", "zone": "Zone 1"}, {"number": "8154", "travee": "DEB1", "zone": "Débord"}, ...]}`;

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
