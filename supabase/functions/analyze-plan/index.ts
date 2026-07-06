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

type LineStoreEntry = { number: string; travee: string; zone?: string };

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
  return /^(M|F|S|H)$/.test(token) || /^5H0{2}$/.test(token) || /^H0{2}$/.test(token) || /^DEB\d?$/.test(token);
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

    const containsStores = tokens.some((_, index) => canReadStoreAt(tokens, index, zone));
    const isStandaloneHeader = tokens.length <= 3 || !containsStores;

    return { zone, explicit: true, persistent: zone === "Zone 1" ? true : isStandaloneHeader };
  }

  return { zone: null, explicit: false, persistent: false };
}

const CRAFT_TRAVEES = new Set(["86","87","88","89","90","91","92","93","94","95","96","98"]);

function isCraftTraveeToken(token: string): boolean {
  return CRAFT_TRAVEES.has(tokenDigits(token));
}

function inferZoneFromTravee(travee: string, fallbackZone: string, _explicitZoneOnLine = false): string {
  const t = String(travee || "").trim().toUpperCase();
  if (t.startsWith("DEB")) return "Débord";
  const digits = t.replace(/[^0-9]/g, "");
  // 86-98 existe en Craft ET en Débord → on respecte le contexte de la ligne.
  if (CRAFT_TRAVEES.has(digits)) {
    if (fallbackZone === "Débord") return "Débord";
    return "Craft";
  }
  if (/^\d{2}$/.test(digits)) {
    const v = Number(digits);
    if (v >= 72 && v <= 85) return "Débord";
  }
  if (/^[A-WYZ]$/.test(t) || /^X$/.test(t) || /^\d{3,}$/.test(digits) || /^99BIS\d?$/.test(t)) return "Zone 1";
  return fallbackZone || "Zone 1";
}

function extractTravee(normalizedLine: string, currentTravee: string): string {
  const tokens = tokenizeLine(normalizedLine);
  return tokens.find(isTraveeToken) ?? currentTravee;
}

function extractStoreNumbers(normalizedLine: string, zoneContext?: string | null): string[] {
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
      if (shouldKeepSeparateTraveeTokens(tokens[i], tokens[cursor], zoneContext)) break;

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

function tokenDigits(token: string): string {
  return normalizePotentialNumber(token).replace(/[^0-9]/g, "");
}

function normalizeZoneName(zone?: string | null): string {
  const normalized = (zone || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("craft") || normalized.includes("kraft")) return "Craft";
  if (normalized.includes("debord") || normalized.includes("deb")) return "Débord";
  return "Zone 1";
}

function isTrailingDebordTraveeToken(token: string): boolean {
  if (/^DEB\d?$/.test(token)) return true;
  const digits = tokenDigits(token);
  if (!/^\d{2}$/.test(digits)) return false;
  const value = Number(digits);
  return value >= 72 && value <= 86;
}

function shouldKeepSeparateTraveeTokens(left: string, right: string, zoneContext?: string | null): boolean {
  const zone = normalizeZoneName(zoneContext);
  if (/^DEB\d?$/.test(left) && /^DEB\d?$/.test(right)) return true;
  if (zone === "Craft") return isCraftTraveeToken(left) && isCraftTraveeToken(right);
  if (zone === "Débord") return isTrailingDebordTraveeToken(left) && isTrailingDebordTraveeToken(right);
  return false;
}

function readStoreEndingBefore(tokens: string[], endExclusive: number): { number: string; startIndex: number } | null {
  for (let startIndex = endExclusive - 1; startIndex >= Math.max(0, endExclusive - 3); startIndex -= 1) {
    const slice = tokens.slice(startIndex, endExclusive);
    if (slice.some((token) => isServiceToken(token) || isTraveeToken(token))) continue;
    const number = slice.map(tokenDigits).join("");
    if (/^\d{4,5}$/.test(number)) return { number, startIndex };
  }

  return null;
}

function readStoreEndingBeforeInRange(tokens: string[], startInclusive: number, endExclusive: number): { number: string; startIndex: number } | null {
  const min = Math.max(0, startInclusive);
  for (let cursor = endExclusive - 1; cursor >= min; cursor -= 1) {
    if (isServiceToken(tokens[cursor]) || isTraveeToken(tokens[cursor])) break;
    const digits = tokenDigits(tokens[cursor]);
    if (!digits) continue;

    let combined = digits;
    let startIndex = cursor;
    for (let left = cursor - 1; left >= min && combined.length < 5; left -= 1) {
      if (isServiceToken(tokens[left]) || isTraveeToken(tokens[left])) break;
      const leftDigits = tokenDigits(tokens[left]);
      if (!leftDigits) continue;
      if (leftDigits.length + combined.length > 5) break;
      combined = leftDigits + combined;
      startIndex = left;
      if (/^\d{4,5}$/.test(combined)) return { number: combined, startIndex };
    }

    if (/^\d{4,5}$/.test(combined)) return { number: combined, startIndex };
  }

  return null;
}

function readStoreStartingInRange(tokens: string[], startInclusive: number, endExclusive: number): { number: string; startIndex: number } | null {
  const max = Math.min(tokens.length, endExclusive);
  for (let cursor = Math.max(0, startInclusive); cursor < max; cursor += 1) {
    if (isServiceToken(tokens[cursor]) || isTraveeToken(tokens[cursor])) continue;
    const digits = tokenDigits(tokens[cursor]);
    if (!digits) continue;

    let combined = digits;
    for (let right = cursor + 1; right < max && combined.length < 5; right += 1) {
      if (isServiceToken(tokens[right]) || isTraveeToken(tokens[right])) break;
      const rightDigits = tokenDigits(tokens[right]);
      if (!rightDigits) continue;
      if (combined.length + rightDigits.length > 5) break;
      combined += rightDigits;
      if (/^\d{4,5}$/.test(combined)) return { number: combined, startIndex: cursor };
    }

    if (/^\d{4,5}$/.test(combined)) return { number: combined, startIndex: cursor };
  }

  return null;
}

function extractExplicitCraftEntries(tokens: string[]): LineStoreEntry[] {
  const entries: LineStoreEntry[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    if (!isCraftTraveeToken(tokens[index])) continue;

    const first = tokenDigits(tokens[index + 1] ?? "");
    const second = tokenDigits(tokens[index + 2] ?? "");
    const directTwoParts = first && second && first.length < 4 && second.length < 4 ? first + second : "";
    if (!shouldKeepSeparateTraveeTokens(tokens[index + 1] ?? "", tokens[index + 2] ?? "", "Craft") && /^\d{4,5}$/.test(directTwoParts)) {
      entries.push({ number: directTwoParts, travee: tokens[index], zone: "Craft" });
      index += 2;
      continue;
    }

    const nextAnchorIndex = tokens.findIndex((token, nextIndex) => nextIndex > index && isCraftTraveeToken(token));
    const after = readStoreStartingInRange(tokens, index + 1, nextAnchorIndex === -1 ? tokens.length : nextAnchorIndex);
    const before = readStoreEndingBeforeInRange(tokens, 0, index);
    const store = after ?? before;
    if (store) entries.push({ number: store.number, travee: tokens[index], zone: "Craft" });
  }

  return entries;
}

function extractTrailingDebordEntry(tokens: string[]): { entry: LineStoreEntry; remainingTokens: string[] } | null {
  if (tokens.length < 4) return null;

  const travee = tokens[tokens.length - 1];
  const quantity = tokens[tokens.length - 2];
  const service = tokens[tokens.length - 3];

  if (!isTrailingDebordTraveeToken(travee)) return null;
  if (/^DEB\d?$/.test(travee) && tokens.some((token, index) => index > 0 && /^(M|F|S)$/.test(token))) return null;
  if (!/^(M|F|S)$/.test(service)) return null;
  if (!/^\d{1,2}$/.test(tokenDigits(quantity))) return null;

  const store = readStoreEndingBefore(tokens, tokens.length - 3);
  if (!store) return null;

  return {
    entry: { number: store.number, travee, zone: "Débord" },
    remainingTokens: tokens.slice(0, store.startIndex),
  };
}

function canReadStoreAt(tokens: string[], index: number, zoneContext?: string | null): boolean {
  if (index < 0 || index >= tokens.length) return false;
  if (isServiceToken(tokens[index])) return false;

  const digits = tokenDigits(tokens[index]);
  if (/^\d{4,5}$/.test(digits)) return true;
  if (!digits || digits.length >= 4) return false;
  if (index === 0 && isTraveeToken(tokens[index])) return false;

  let combined = digits;
  let cursor = index + 1;
  while (combined.length < 5 && cursor < tokens.length) {
    if (isServiceToken(tokens[cursor])) break;
    if (shouldKeepSeparateTraveeTokens(tokens[index], tokens[cursor], zoneContext)) break;
    const nextDigits = tokenDigits(tokens[cursor]);
    if (isTraveeToken(tokens[cursor]) && !/^\d{1,3}$/.test(nextDigits)) break;
    if (!nextDigits || combined.length + nextDigits.length > 5) break;
    combined += nextDigits;
    if (/^\d{4,5}$/.test(combined)) return true;
    cursor += 1;
  }

  return false;
}

function hasReadableStoreAfter(tokens: string[], index: number, zoneContext?: string | null): boolean {
  for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
    if (canReadStoreAt(tokens, cursor, zoneContext)) return true;
  }
  return false;
}

function isQuantityToken(tokens: string[], index: number): boolean {
  const digits = tokenDigits(tokens[index]);
  return /^\d{1,2}$/.test(digits) && (/^(M|F|S)$/.test(tokens[index - 1] ?? "") || /^(M|F|S)$/.test(tokens[index - 2] ?? ""));
}

function isLineTraveeAnchor(tokens: string[], index: number, explicitZoneOnLine: boolean, zoneContext?: string | null): boolean {
  const token = tokens[index];
  if (!isTraveeToken(token)) return false;
  if (isQuantityToken(tokens, index)) return false;

  const hasStoreAfter = hasReadableStoreAfter(tokens, index, zoneContext);
  if (isCraftTraveeToken(token)) return hasStoreAfter;
  if (index === 0) return hasStoreAfter;
  if (!hasStoreAfter) return false;
  // DEB1-DEB6 = vraies travées Débord. DEB seul à l'intérieur d'une ligne aussi.
  if (/^DEB[1-9]$/.test(token)) return true;
  if (/^DEB$/.test(token) && index > 0) return true;
  if (explicitZoneOnLine && index <= 2) return true;

  const digits = tokenDigits(token);
  const previousDigits = tokenDigits(tokens[index - 1] ?? "");
  if (/^\d{4,5}$/.test(previousDigits)) return true;
  if (/^[A-Z]/.test(token)) return true;
  if (/^99BIS\d?$/.test(token)) return true;

  return false;
}

function extractLineStoreEntries(
  tokens: string[],
  currentTravee: string,
  explicitZoneOnLine: boolean,
  explicitZoneName: string | null = null,
): LineStoreEntry[] {
  const trailingDebord = extractTrailingDebordEntry(tokens);
  const workingTokens = trailingDebord?.remainingTokens ?? tokens;
  const explicitCraftEntries = explicitZoneName === "Craft" ? extractExplicitCraftEntries(workingTokens) : [];

  if (explicitCraftEntries.length) {
    return [...explicitCraftEntries, ...(trailingDebord ? [trailingDebord.entry] : [])];
  }

  const anchors = workingTokens
    .map((token, index) => ({ token, index }))
    .filter(({ index }) => isLineTraveeAnchor(workingTokens, index, explicitZoneOnLine, explicitZoneName));

  const debordEntries = trailingDebord ? [trailingDebord.entry] : [];

  if (!anchors.length) {
    return [
      ...extractStoreNumbers(workingTokens.join(" "), explicitZoneName).map((number) => ({ number, travee: currentTravee || "?" })),
      ...debordEntries,
    ];
  }

  const anchoredEntries = anchors.flatMap((anchor, anchorIndex) => {
    const nextAnchorIndex = anchors[anchorIndex + 1]?.index ?? workingTokens.length;
    const segment = [anchor.token, ...workingTokens.slice(anchor.index + 1, nextAnchorIndex)].join(" ");
    return extractStoreNumbers(segment, explicitZoneName).map((number) => ({ number, travee: anchor.token }));
  });

  return [...anchoredEntries, ...debordEntries];
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

    const lineEntries = extractLineStoreEntries(tokens, currentTravee, lineZone.explicit, lineZone.zone ?? currentZone);
    const lastLineTravee = [...lineEntries].reverse().find((entry) => !entry.zone)?.travee;

    if (lastLineTravee && lastLineTravee !== "?") {
      currentTravee = lastLineTravee;
    } else if (!lineEntries.length && !/ZONE\s*1/i.test(normalizedLine)) {
      currentTravee = extractTravee(normalizedLine, currentTravee);
    }

    for (const { number, travee, zone } of lineEntries) {
      const inferredZone = zone ?? inferZoneFromTravee(travee, lineZone.zone ?? currentZone, lineZone.explicit);
      stores.push({ number, travee, zone: inferredZone });
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

const GROQ_VISION_MODELS = [
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "meta-llama/llama-4-scout-17b-16e-instruct",
];

type UserKeys = {
  gemini_pro?: string;
  gemini_flash?: string;
  groq?: string;
  deepseek?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const ENV_GROQ_KEY = Deno.env.get("GROQ_API_KEY");

    const { imageBase64, userGroqKey, userKeys: rawKeys, activeProvider } = await req.json();
    const userKeys: UserKeys = (rawKeys && typeof rawKeys === "object") ? rawKeys : {};

    // rétro-compat : ancienne clé Groq isolée
    if (!userKeys.groq && typeof userGroqKey === "string" && userGroqKey.trim().length > 10) {
      userKeys.groq = userGroqKey.trim();
    }

    const cleanKey = (v: unknown) => (typeof v === "string" && v.trim().length > 10 ? v.trim() : "");
    const K = {
      gemini_pro: cleanKey(userKeys.gemini_pro),
      gemini_flash: cleanKey(userKeys.gemini_flash),
      groq: cleanKey(userKeys.groq),
      deepseek: cleanKey(userKeys.deepseek),
    };

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "imageBase64 is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");

    const systemPrompt = `Tu es uniquement un moteur OCR brut pour STAF Transport. Tu ne dois PAS créer une liste de magasins.

Objectif : recopier le texte visible du plan, ligne par ligne, sans interprétation.

Règles obligatoires :
1. Lis toute l'image, surtout la grille et les bords.
2. Retourne les lignes dans l'ordre visuel, de haut en bas puis gauche à droite.
3. Conserve les travées visibles (72, 86, 306, 99BIS, DEB, DEB4, X, Y...).
4. Conserve les textes de cellule tels que vus : magasins, M/F/S, quantités, 5H00, DEB.
5. N'ajoute jamais un magasin supposé. Ne complète jamais un chiffre flou. Si c'est illisible, écris "?". Si une case est vide, n'écris aucun numéro pour cette case.
6. Ne fusionne jamais une quantité avec le magasin suivant : "6317 F 6 8485" doit rester ce texte brut.
7. Sépare les zones au lieu de mélanger les colonnes :
   - Écris une ligne "ZONE 1" avant le grand tableau gauche/centre.
   - Écris une ligne "DEBORD" avant la colonne tout à droite. Les magasins de Débord sont les numéros placés juste à gauche des travées tout à droite (72-86, DEB, DEB1, DEB2, DEB3, DEB4, DEB5, DEB6). Exemple réel : "86 9083" signifie magasin 9083 en débord 86.
   - IMPORTANT : DEB, DEB1, DEB2, DEB3, DEB4, DEB5, DEB6 sont des travées Débord INDÉPENDANTES, exactement comme 72, 73, 74, 75. Chacune contient UN SEUL magasin. Écris chaque DEBn sur sa propre ligne : "DEB1 9571", "DEB2 7822", "DEB3 7576", etc. Ne fusionne jamais deux DEBn ensemble.
   - Écris une ligne "CRAFT" avant la zone Craft indépendante en haut de la page.
   - Zone Craft = travées 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 98. Il y a un seul magasin par travée quand un numéro de magasin est réellement écrit : par exemple "88 8214" et "92 9083". Si tu vois seulement les travées "86 87 88 89" sans numéro magasin dans les cases, ne transforme jamais ces travées en magasins.
   - Ne mélange jamais Craft avec Zone 1 : un magasin Craft ne doit jamais finir en 803, 404 ou 306.
   - Les travées lettre seules comme X sont des travées Zone 1 séparées : "306 10892 X 8214" signifie 10892 en 306 et 8214 en X.
   - Ne mets jamais un magasin de la colonne tout à droite dans Zone 1.
8. Ne retourne aucun objet magasin structuré : seulement le texte OCR brut.

Format strict : {"lines":["ligne OCR 1","ligne OCR 2"]}. Aucun markdown.`;

    const userPrompt = `Relis le plan en OCR brut complet. Ne fais pas d'analyse rapide, ne calcule rien, ne devine rien. Retourne seulement {"lines":[...]} avec les lignes réellement visibles.`;

    const buildMessages = () => ([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}` } },
        ],
      },
    ]);

    const openaiCompatCall = (url: string, apiKey: string, model: string, extraHeaders: Record<string,string> = {}) =>
      fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...extraHeaders,
        },
        body: JSON.stringify({ model, temperature: 0, messages: buildMessages() }),
      });

    const callGroq = (apiKey: string, model: string) =>
      openaiCompatCall("https://api.groq.com/openai/v1/chat/completions", apiKey, model);
    const callGemini = (apiKey: string, model: string) =>
      openaiCompatCall("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", apiKey, model);
    const callDeepSeek = (apiKey: string, model: string) =>
      openaiCompatCall("https://api.deepseek.com/chat/completions", apiKey, model);
    const callLovable = (model: string) =>
      openaiCompatCall("https://ai.gateway.lovable.dev/v1/chat/completions", LOVABLE_API_KEY ?? "", model, { "Lovable-API-Key": LOVABLE_API_KEY ?? "" });

    type Attempt = { provider: string; model: string; call: () => Promise<Response> };
    const providerAttempts: Record<string, Attempt[]> = {
      gemini_pro:   K.gemini_pro   ? [{ provider: "gemini_pro",   model: "gemini-2.5-pro",   call: () => callGemini(K.gemini_pro, "gemini-2.5-pro") }] : [],
      gemini_flash: K.gemini_flash ? [{ provider: "gemini_flash", model: "gemini-2.5-flash", call: () => callGemini(K.gemini_flash, "gemini-2.5-flash") }] : [],
      groq:         K.groq         ? GROQ_VISION_MODELS.map(m => ({ provider: "groq", model: m, call: () => callGroq(K.groq, m) })) : [],
      deepseek:     K.deepseek     ? [{ provider: "deepseek", model: "deepseek-chat", call: () => callDeepSeek(K.deepseek, "deepseek-chat") }] : [],
    };

    // Ordre : actif d'abord, puis les autres avec clé perso, puis fallback env
    const priorityOrder: string[] = [];
    if (activeProvider && providerAttempts[activeProvider]?.length) priorityOrder.push(activeProvider);
    for (const p of ["gemini_pro","gemini_flash","groq","deepseek"]) {
      if (!priorityOrder.includes(p) && providerAttempts[p].length) priorityOrder.push(p);
    }

    const attempts: Attempt[] = priorityOrder.flatMap(p => providerAttempts[p]);

    // fallback env (Groq partagé + Lovable)
    if (ENV_GROQ_KEY && !K.groq) {
      for (const m of GROQ_VISION_MODELS) attempts.push({ provider: "groq-env", model: m, call: () => callGroq(ENV_GROQ_KEY, m) });
    }
    if (LOVABLE_API_KEY) {
      for (const model of OCR_MODELS) attempts.push({ provider: "lovable", model, call: () => callLovable(model) });
    }

    if (!attempts.length) {
      throw new Error("Aucune clé IA configurée. Ajoute une clé perso (Gemini, Groq ou DeepSeek) depuis le menu.");
    }

    let bestRead: { provider: string; model: string; content: string; rawText: string; stores: StoreData[]; score: number; travees: number } | null = null;
    let lastStatus = 0;
    let lastErrorText = "";

    for (const attempt of attempts) {
      let response: Response;
      try {
        response = await attempt.call();
      } catch (e) {
        console.error("Provider call failed:", attempt.provider, attempt.model, e);
        continue;
      }
      lastStatus = response.status;

      if (!response.ok) {
        lastErrorText = await response.text();
        console.error("AI provider error:", attempt.provider, attempt.model, response.status, lastErrorText);
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      const lines = extractOcrLines(content);
      const rawText = lines.join("\n");
      const stores = parsePlanText(rawText);
      const quality = getReadQuality(stores);
      console.log(`[${attempt.provider}] ${attempt.model}: ${stores.length} magasins, ${quality.travees} travées`);

      if (!bestRead || quality.score > bestRead.score) {
        bestRead = { provider: attempt.provider, model: attempt.model, content, rawText, stores, score: quality.score, travees: quality.travees };
      }

      if (isReliableRead(stores)) break;
    }

    if (!bestRead?.content) {
      throw new Error(`Aucun modèle n'a pu lire le plan (dernier statut ${lastStatus}): ${lastErrorText}`);
    }

    console.log(`Selected [${bestRead.provider}] ${bestRead.model}: ${bestRead.stores.length} magasins, ${bestRead.travees} travées`);

    return new Response(
      JSON.stringify({
        stores: bestRead.stores,
        rawText: bestRead.rawText,
        source: `${bestRead.provider}-raw-ocr`,
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
