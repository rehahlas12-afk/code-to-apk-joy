import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const systemPrompt = `Tu es un expert en extraction de tableaux à partir de photos de plans de dispatch STAF Transport.

Le plan est un tableau quadrillé. Chaque case d'en-tête de ligne/colonne contient un numéro de travée (ex: 72, 86, 306) ou un code (99BIS, DEB) ou une lettre (X, Y). Les autres cases contiennent un ou plusieurs numéros de magasin à 4 ou 5 chiffres.

Ta seule mission : extraire TOUS les numéros de magasin du plan avec leur travée. Sois exhaustif. Ne saute aucune case. Si un numéro est flou, donne ta meilleure estimation.

Zones :
- "Débord" si la travée est dans une zone marquée DEBORD/DEB, ou pour la travée 86 seule
- "Craft" si la travée est dans une zone marquée CRAFT/KRAFT, ou pour 86 marqué CRAFT
- "Zone 1" sinon (par défaut), y compris pour les travées-lettres (X, Y...)

Retourne UNIQUEMENT un tableau JSON, sans texte autour.`;

    const userPrompt = `Extrais TOUS les magasins de ce plan. Format JSON :
[{"number":"8486","travee":"72","zone":"Débord"},{"number":"6317","travee":"306","zone":"Zone 1"}]

Parcours chaque case du tableau. N'oublie aucun magasin.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

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
