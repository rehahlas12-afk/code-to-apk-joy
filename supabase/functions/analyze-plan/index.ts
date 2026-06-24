import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIN_RELIABLE_PLAN_STORES = 35;
const MIN_RELIABLE_PLAN_TRAVEES = 12;
const OCR_MODELS = ["openai/gpt-5.5", "google/gemini-2.5-pro", "google/gemini-3.1-pro-preview"];

type StoreData = {
  number: string;
  travee: string;
  zone: string;
};

const OCR_DIGIT_FIXES: Record<string, string> = {
  O: "0", Q: "0", D: "0", I: "1", L: "1", "|": "1",
  Z: "2", S: "5", B: "8", G: "6",
};

const ZONE_PATTERNS: { pattern: RegExp; zone: string }[] = [
  { pattern: /DEBORD|DEB/i, zone: "Débord" },
  { pattern: /CRAFT|CRAFTER|KRAFT/i, zone: "Craft" },
  { pattern: /ZONE\s*1/i, zone: "Zone 1" },
];

function normalizeOcrLine(line: string): string {
  return line
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/['']/g, "")
    .replace(/(\d)[,;:./\\-]+(?=\d)/g, "$1");
}

function normalizePotentialNumber(token: string): string {
  return token.split("").map((char) => OCR_DIGIT_FIXES[char] ?? char).join("");
}

function tokenizeLine(normalizedLine: string): string[] {
  return normalizedLine.match(/[A-Z0-9|]+/g) ?? [];
}

function isServiceToken(token: string): boolean {
  return /^(M|F|S|H|X)$/.test(token) || /^5H0{2}$/.test(token) || /^H0{2}$/.test(token) || /^DEB\d?$/.test(token);
}

function isTraveeToken(token: string): boolean {
  if (/^(M|F|S|H)$/.test(token)) return false;

  return (
    /^99BIS\d?$/.test(token) ||
    /^DEB\d?$/.test(token) ||
    /^[1-9]\d{1,2}$/.test(token) ||
    /^[A-WYZ]$/.test(token) ||
    /^X$/.test(token) ||
    /^[A-Z]\d{1,2}$/.test(token) ||
    /^\d{1,3}[A-Z]$/.test(token)
  );
}

function detectLineZone(normalizedLine: string, tokens: string[]): { zone: string | null; explicit: boolean; persistent: boolean } {
  for (const { pattern, zone } of ZONE_PATTERNS) {
    if (!pattern.test(normalizedLine)) continue;

    const isDebTraveeAtEnd = zone === "Débord" && tokens.some((token, index) => /^DEB\d?$/.test(token) && index > 0);
    if (isDebTraveeAtEnd) return { zone: null, explicit: false, persistent: false };

    return { zone, explicit: true, persistent: true };
  }

  return { zone: null, explicit: false, persistent: false };
}

function inferZoneFromTravee(travee: string, fallbackZone: string, explicitZoneOnLine = false): string {
  if (travee.startsWith("DEB")) return "Débord";
  if (explicitZoneOnLine && /CRAFT|KRAFT/i.test(fallbackZone)) return "Craft";
  const traveeNumber = Number(travee);
  if (Number.isNaN(traveeNumber)) return fallbackZone;
  if (traveeNumber === 86) return "Débord";
  if (/CRAFT|KRAFT/i.test(fallbackZone)) return "Craft";
  if (traveeNumber >= 72 && traveeNumber <= 86) return "Débord";
  if (traveeNumber >= 86 && traveeNumber <= 95) return "Craft";
  return fallbackZone;
}

function extractTravee(normalizedLine: string, currentTravee: string): string {
  const tokens = tokenizeLine(normalizedLine);
  return tokens.find(isTraveeToken) ?? currentTravee;
}

function extractStoreNumbers(normalizedLine: string): string[] {
  const storeNumbers = new Set<string>();
  const tokens = tokenizeLine(normalizedLine);

  for (let i = 0; i < tokens.length; i += 1) {
    if (i === 0 && isTraveeToken(tokens[i])) continue;
    if (isServiceToken(tokens[i])) continue;

    const normalizedToken = normalizePotentialNumber(tokens[i]).replace(/[^0-9]/g, "");
    if (!normalizedToken) continue;

    if (/^\d{4,5}$/.test(normalizedToken)) {
      storeNumbers.add(normalizedToken);
      continue;
    }
    if (normalizedToken.length >= 4) continue;

    let combined = normalizedToken;
    let cursor = i + 1;
    while (combined.length < 5 && cursor < tokens.length) {
      if (isServiceToken(tokens[cursor])) break;

      const nextToken = normalizePotentialNumber(tokens[cursor]).replace(/[^0-9]/g, "");
      if (!nextToken || combined.length + nextToken.length > 5) break;
      if (/^\d{4,5}$/.test(nextToken)) break;

      combined += nextToken;
      if (/^\d{4,5}$/.test(combined)) {
        storeNumbers.add(combined);
        i = cursor;
        break;
      }
      cursor += 1;
    }
  }
  return [...storeNumbers];
}

function dedupeStores(stores: StoreData[]): StoreData[] {
  const seen = new Set<string>();
  return stores.filter((store) => {
    const key = `${store.number}-${store.travee}-${store.zone}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parsePlanText(text: string): StoreData[] {
  const stores: StoreData[] = [];
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  let currentZone = "Zone 1";
  let currentTravee = "";

  for (const line of lines) {
    const normalizedLine = normalizeOcrLine(line);
    const tokens = tokenizeLine(normalizedLine);
    const lineZone = detectLineZone(normalizedLine, tokens);

    if (lineZone.zone && lineZone.persistent) {
      currentZone = lineZone.zone;
    }

    currentTravee = extractTravee(normalizedLine, currentTravee);
    const inferredZone = inferZoneFromTravee(currentTravee, lineZone.zone ?? currentZone, lineZone.explicit);

    for (const number of extractStoreNumbers(normalizedLine)) {
      stores.push({ number, travee: currentTravee || "?", zone: inferredZone });
    }
  }

  return dedupeStores(stores);
}

function getReadQuality(stores: StoreData[]) {
  const travees = new Set(stores.map((store) => String(store.travee || "").trim().toUpperCase()).filter((travee) => travee && travee !== "?"));
  const unknownTravees = stores.filter((store) => !store.travee || store.travee === "?").length;
  const score = stores.length + travees.size * 5 - unknownTravees * 3;
  return { travees: travees.size, score };
}

function isReliableRead(stores: StoreData[]) {
  const quality = getReadQuality(stores);
  return stores.length >= MIN_RELIABLE_PLAN_STORES && quality.travees >= MIN_RELIABLE_PLAN_TRAVEES;
}

function extractJsonFromContent(content: string): unknown | null {
  const objectMatch = content.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch (_) {
      // Continue with raw text fallback below.
    }
  }

  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch (_) {
      return null;
    }
  }

  return null;
}

function extractOcrLines(content: string): string[] {
  const parsed = extractJsonFromContent(content);
  if (Array.isArray(parsed)) return parsed.map((line) => String(line || "").trim()).filter(Boolean);

  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { lines?: unknown[] }).lines)) {
    return (parsed as { lines: unknown[] }).lines.map((line) => String(line || "").trim()).filter(Boolean);
  }

  return content
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { imageBase64 } = await req.json();
    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "imageBase64 is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Remove data URL prefix if present
    const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");

    const systemPrompt = `Tu es uniquement un moteur OCR brut pour STAF Transport. Tu ne dois PAS créer une liste de magasins.

Objectif : recopier le texte visible du plan, ligne par ligne, sans interprétation.

Règles obligatoires :
1. Lis toute l'image, surtout la grille et les bords.
2. Retourne les lignes dans l'ordre visuel, de haut en bas puis gauche à droite.
3. Conserve les travées visibles (72, 86, 306, 99BIS, DEB, DEB4, X, Y...).
4. Conserve les textes de cellule tels que vus : magasins, M/F/S, quantités, 5H00, DEB.
5. N'ajoute jamais un magasin supposé. Ne complète jamais un chiffre flou. Si c'est illisible, écris "?".
6. Ne fusionne jamais une quantité avec le magasin suivant : "6317 F 6 8485" doit rester ce texte brut.
7. Ne retourne aucun objet magasin structuré : seulement le texte OCR brut.

Format strict : {"lines":["ligne OCR 1","ligne OCR 2"]}. Aucun markdown.`;

    const userPrompt = `Relis le plan en OCR brut complet. Ne fais pas d'analyse rapide, ne calcule rien, ne devine rien. Retourne seulement {"lines":[...]} avec les lignes réellement visibles.`;

    const callVisionModel = (model: string) => fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": LOVABLE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Data}`,
                },
              },
            ],
          },
        ],
      }),
    });

    let bestRead: { model: string; content: string; rawText: string; stores: StoreData[]; score: number; travees: number } | null = null;
    let lastStatus = 0;
    let lastErrorText = "";

    for (const model of OCR_MODELS) {
      const response = await callVisionModel(model);
      lastStatus = response.status;

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Trop de requêtes, réessayez dans quelques secondes." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: "Crédits IA épuisés. Ajoutez des crédits dans Settings > Workspace > Usage." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        lastErrorText = await response.text();
        console.error("AI gateway error:", model, response.status, lastErrorText);
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      const lines = extractOcrLines(content);
      const rawText = lines.join("\n");
      const stores = parsePlanText(rawText);
      const quality = getReadQuality(stores);
      console.log(`Model ${model} OCR raw parsed ${stores.length} stores across ${quality.travees} travees`);

      if (!bestRead || quality.score > bestRead.score) {
        bestRead = { model, content, rawText, stores, score: quality.score, travees: quality.travees };
      }

      if (isReliableRead(stores)) break;
    }

    if (!bestRead?.content) {
      if (lastStatus === 429) {
        return new Response(
          JSON.stringify({ error: "Trop de requêtes, réessayez dans quelques secondes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (lastStatus === 402) {
        return new Response(
          JSON.stringify({ error: "Crédits IA épuisés. Ajoutez des crédits dans Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway error: ${lastStatus} ${lastErrorText}`);
    }

    console.log(`Selected ${bestRead.model}: ${bestRead.stores.length} stores across ${bestRead.travees} travees`);

    return new Response(
      JSON.stringify({
        stores: bestRead.stores,
        rawText: bestRead.rawText,
        source: "ai-raw-ocr",
        model: bestRead.model,
        quality: { stores: bestRead.stores.length, travees: bestRead.travees },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("analyze-plan error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
