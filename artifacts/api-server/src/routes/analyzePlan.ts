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
  const replitGeminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

  // Client sends x-ai-provider and x-ai-key when using personal keys
  const userProvider = (req.headers["x-ai-provider"] as string | undefined)?.trim() || "gemini";
  const userKey = (req.headers["x-ai-key"] as string | undefined)?.trim()
    || (req.headers["x-gemini-api-key"] as string | undefined)?.trim(); // legacy compat

  // Provider configs for OpenAI-compatible APIs
  // Groq: llama-3.2-90b-vision-preview = 90B params, best vision model on Groq (vs 17B scout)
  const OPENAI_COMPAT: Record<string, { baseUrl: string; model: string }> = {
    groq:     { baseUrl: "https://api.groq.com/openai/v1",  model: "llama-3.2-90b-vision-preview" },
    deepseek: { baseUrl: "https://api.deepseek.com",        model: "deepseek-vl2" },
    openai:   { baseUrl: "https://api.openai.com/v1",       model: "gpt-4o" },
  };

  const isOpenAICompat = userKey && userProvider in OPENAI_COMPAT;
  const geminiApiKey = (userProvider === "gemini" ? userKey : null) || replitGeminiKey;

  if (!geminiApiKey && !isOpenAICompat) {
    res.status(503).json({ error: "IA non configurée — ajoutez une clé API dans les paramètres." });
    return;
  }

  // Universal prompt — designed to work equally well with Gemini, Llama (Groq/Meta), DeepSeek, and OpenAI
  const prompt = `Tu analyses une image de plan de dispatch entrepôt.

FORMAT DE SORTIE — une ligne par magasin :
ZONE1 [travée] [magasin]
CRAFT [travée] [magasin]
DEBORD [travée] [magasin]

DÉFINITIONS :
• Travée = nombre 2-3 chiffres (72-999), DEB1/DEB2..., 99BIS/99BIS1/99BIS2/99BIS3, ou la lettre X
• Magasin = nombre à 4 ou 5 chiffres exactement
• IGNORER : nombres 1-2 chiffres (quantités palettes), lettres M et S, heures (ex: 5H00), flèches

LES 3 ZONES DU PLAN :
• DEBORD → colonne verticale sur le côté DROIT. Travées : DEB1, DEB2... ou 72 à 85 (parfois aussi 86+). Lecture droite→gauche : travée à droite, magasin à gauche. Un seul magasin par travée.
• CRAFT → section HORIZONTALE séparée. Travées 86 à 98. Chaque colonne = une travée : son numéro est EN HAUT, le magasin est EN BAS de cette même colonne. Les colonnes vont du grand au petit de gauche à droite (98...87 86).
• ZONE1 → tableau principal vertical. Première colonne = travée (99, 99BIS, 100 à 803, X). Colonnes suivantes = magasins (1 ou 2 par ligne). Lecture gauche→droite.

⚠️ ATTENTION : Le numéro 86 peut exister À LA FOIS dans DEBORD (colonne droite) ET dans CRAFT (section horizontale). Identifie la zone d'après la position physique sur l'image.

Exemples de sortie :
DEBORD DEB1 9812
DEBORD DEB2 11839
DEBORD 86 9684
CRAFT 86 8214
CRAFT 87 7879
CRAFT 88 10032
ZONE1 99 8999
ZONE1 99BIS1 8060
ZONE1 103 8176 6317
ZONE1 306 10892
ZONE1 X 9037
ZONE1 402 9668

Transcris maintenant l'intégralité du plan — ne saute aucune ligne :`;

  try {
    const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
    let rawText = "";
    let finishReason = "unknown";

    if (isOpenAICompat) {
      // ---- OpenAI-compatible path (Groq, Mistral, OpenAI) ----
      const cfg = OPENAI_COMPAT[userProvider];
      const body = {
        model: cfg.model,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}` } },
          ],
        }],
        temperature: 0.0,
        max_tokens: 8192,
      };
      const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${userKey}` },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errText = await response.text();
        req.log.error({ status: response.status, body: errText, provider: userProvider }, "OpenAI-compat API error");
        res.status(502).json({ error: `Erreur ${userProvider}: ${response.status}` });
        return;
      }
      const data = await response.json() as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }> };
      rawText = data.choices?.[0]?.message?.content ?? "";
      finishReason = data.choices?.[0]?.finish_reason ?? "unknown";

    } else {
      // ---- Gemini path ----
      // Personal keys use gemini-2.5-flash (free, much smarter than 2.0-flash, almost as good as 2.5-pro).
      // Replit's built-in integration uses gemini-2.5-pro (most powerful).
      const isPersonalKey = !!userKey;
      const effectiveBaseUrl = isPersonalKey
        ? "https://generativelanguage.googleapis.com/v1beta"
        : geminiBaseUrl!;
      const geminiModel = isPersonalKey ? "gemini-2.5-flash" : "gemini-2.5-pro";
      const body = {
        contents: [{
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: base64Data } },
          ],
        }],
        generationConfig: { temperature: 0.0, maxOutputTokens: 32768 },
      };
      const url = `${effectiveBaseUrl}/models/${geminiModel}:generateContent?key=${geminiApiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errText = await response.text();
        req.log.error({ status: response.status, body: errText }, "Gemini API error");
        res.status(502).json({ error: "Erreur Gemini AI" });
        return;
      }
      const geminiData = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      };
      const candidate = geminiData.candidates?.[0];
      rawText = candidate?.content?.parts?.[0]?.text ?? "";
      finishReason = candidate?.finishReason ?? "unknown";
    }

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
