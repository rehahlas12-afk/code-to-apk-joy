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

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    res.status(503).json({ error: "AI analysis not configured (GEMINI_API_KEY missing)" });
    return;
  }

  try {
    const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");

    const prompt = `Tu es un lecteur expert de plans de dispatch entrepôt français.

Analyse cette image d'un plan de travail et extrais les données de placement des magasins.

FORMAT DU PLAN :
- Chaque ligne contient : NUMÉRO_TRAVÉE  MAGASIN1  MAGASIN2  ...
- Le numéro de travée est TOUJOURS LE PREMIER élément de la ligne
- Les numéros de magasins viennent APRÈS le numéro de travée
- Les numéros de magasins sont des nombres COURTS : 1 à 5 chiffres (ex: 8, 59, 78, 306...)
- Ne confonds pas les numéros de travées avec les numéros de magasins

TYPES DE TRAVÉES :
1. Travées Zone 1 : 99BIS, 99BIS1, 99BIS2, 99, 101 à 104, 201 à 204, 301 à 306X, 401 à 404, 501 à 504, 601 à 604, 701 à 704, 801 à 803
   → Peuvent contenir 1, 2, 3 ou 4 magasins par travée

2. Travées Débord : 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85 et DEB1, DEB2, DEB3, DEB4, DEB5
   → Contiennent TOUJOURS exactement 1 seul magasin par travée
   → Zone = "Débord"

3. Travées Craft : 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98 (souvent avec le mot "CRAFT" ou "KRAFT" écrit sur le plan)
   → Contiennent TOUJOURS exactement 1 seul magasin par travée
   → Zone = "Craft"

RÈGLES IMPORTANTES :
- N'invente AUCUN magasin — extrait UNIQUEMENT ce qui est écrit sur le plan
- Si une travée a plusieurs magasins, liste-les tous séparément
- Le numéro de magasin peut être très court (1, 2 ou 3 chiffres)
- Ignore les en-têtes, titres et textes qui ne sont pas des numéros de travées ou de magasins

ZONES :
- Travées 72–85 et DEB* → "Débord"
- Travées 86–98 → "Craft"
- Tout le reste → "Zone 1"

Retourne UNIQUEMENT du JSON valide dans ce format exact, sans explication ni markdown :
{"stores": [{"number": "78", "travee": "DEB1", "zone": "Débord"}, {"number": "59", "travee": "101", "zone": "Zone 1"}, ...]}`;

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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

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
    const stores: StoreData[] = (parsed.stores ?? []).map((s) => ({
      number: String(s.number ?? "").trim(),
      travee: String(s.travee ?? "").trim(),
      zone: String(s.zone ?? "Zone 1").trim(),
    })).filter((s) => s.number && s.travee);

    req.log.info({ count: stores.length }, "AI plan analysis complete");
    res.json({ stores });
  } catch (err) {
    req.log.error({ err }, "analyze-plan route error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
