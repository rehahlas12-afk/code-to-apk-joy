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
    // Strip data URL prefix if present
    const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");

    const body = {
      contents: [
        {
          parts: [
            {
              text: `You are a warehouse plan reader. Analyze this image of a store dispatch plan and extract all store/merchandise location data.

For each row/entry in the plan, extract:
- number: the store number (4-5 digit number, or alphanumeric like 99BIS)
- travee: the aisle/row identifier (numeric like 101, 202, or special like DEB, 99BIS)
- zone: one of "Zone 1", "Débord", or "Craft"

Zone rules:
- Travees starting with DEB or numbered 72-86 → "Débord"
- Travees numbered 86-95 → "Craft"
- All others → "Zone 1"

Return ONLY valid JSON in this exact format:
{"stores": [{"number": "12345", "travee": "101", "zone": "Zone 1"}, ...]}

Do not include any explanation, markdown, or text outside the JSON.`,
            },
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
        temperature: 0.1,
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

    // Extract JSON from the response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      req.log.error({ rawText }, "No JSON found in Gemini response");
      res.status(502).json({ error: "Could not parse AI response" });
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]) as { stores?: StoreData[] };
    const stores: StoreData[] = parsed.stores ?? [];

    req.log.info({ count: stores.length }, "AI plan analysis complete");
    res.json({ stores });
  } catch (err) {
    req.log.error({ err }, "analyze-plan route error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
