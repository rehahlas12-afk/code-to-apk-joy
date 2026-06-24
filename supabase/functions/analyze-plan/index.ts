import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIN_RELIABLE_PLAN_STORES = 35;
const OCR_MODELS = ["google/gemini-2.5-pro", "google/gemini-3.1-pro-preview"];

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

    const systemPrompt = `Tu es l'OCR de production pour STAF Transport. La priorité absolue est l'exactitude : ne jamais inventer un magasin ou une travée.

Le plan est un tableau quadrillé. Les en-têtes de lignes/colonnes sont des travées : nombres 1 à 3 chiffres (72, 86, 306...), codes (99BIS, DEB, DEB4...), ou lettres seules (X, Y, Z, A...). Les cases contiennent un ou plusieurs magasins à 4 ou 5 chiffres.

Méthode obligatoire :
1. Repère toutes les travées visibles, même petites, floues ou sur les bords.
2. Balaye toute la grille cellule par cellule, de gauche à droite et de haut en bas.
3. Extrait uniquement les groupes de 4 ou 5 chiffres réellement visibles comme magasin. Si plusieurs magasins sont dans la même case, retourne-les tous.
4. N'invente jamais un numéro à partir d'une quantité, d'un sexe ou d'une heure. Exemple : "6317 F 6 8485" = 6317 et 8485 seulement, jamais 68485. "5H00" n'est jamais un magasin.
5. Associe le magasin à la travée la plus proche de sa ligne/colonne. Si la travée est incertaine, mets "?" mais garde le magasin.
6. Ne supprime jamais un magasin parce qu'il semble doublon dans une autre travée : garde-le si la travée ou la zone change.
7. Si un chiffre est trop flou pour être lu avec confiance, ignore ce magasin au lieu de créer une estimation.

Zones :
- "Débord" si la zone est marquée DEBORD/DEB, ou si la travée numérique est 72 à 86 sans mention Craft/Kraft.
- "Craft" uniquement si la case/zone est marquée CRAFT/KRAFT/CRAFTER.
- "Zone 1" sinon, toujours pour les travées lettres comme X/Y/Z/A.

Retourne UNIQUEMENT un tableau JSON, sans markdown ni texte autour.`;

    const userPrompt = `Analyse le plan complet en mode EXHAUSTIF et STRICT. Ne fais pas un résumé rapide : lis chaque case.

Format exact :
[{"number":"8486","travee":"72","zone":"Débord"},{"number":"6317","travee":"306","zone":"Zone 1"}]

Règle importante : retourne seulement les magasins réellement visibles sur le plan. N'ajoute jamais de numéros supposés.`;

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

    let content = "";
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
      content = data.choices?.[0]?.message?.content || "";
      const quickCount = (content.match(/"number"\s*:/g) ?? []).length;
      console.log(`Model ${model} returned about ${quickCount} stores`);
      if (quickCount >= MIN_RELIABLE_PLAN_STORES || model === OCR_MODELS[OCR_MODELS.length - 1]) break;
    }

    if (!content) {
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

    // Extract JSON array from the response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("No JSON array found in AI response:", content);
      return new Response(
        JSON.stringify({ stores: [], rawResponse: content }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stores = JSON.parse(jsonMatch[0]);

    // Validate and normalize
    const normalizeZone = (zone: string) => {
      const z = String(zone || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      if (z.includes("craft") || z.includes("kraft")) return "Craft";
      if (z.includes("debord") || z.includes("deb")) return "Débord";
      return "Zone 1";
    };

    const validStores = stores
      .filter((s: any) => s.number && /^\d{4,5}$/.test(String(s.number).trim()))
      .map((s: any) => {
        const travee = String(s.travee || "?").trim();
        // Lettres seules (X, Y, Z…) sont TOUJOURS en Zone 1
        const zone = /^[A-Za-z]$/.test(travee) ? "Zone 1" : normalizeZone(s.zone);
        return { number: String(s.number).trim(), travee, zone };
      });

    // Dedupe
    const seen = new Set<string>();
    const deduped = validStores.filter((s: any) => {
      const key = `${s.number}-${s.travee}-${s.zone}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`Extracted ${deduped.length} stores from plan`);

    return new Response(
      JSON.stringify({ stores: deduped }),
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
