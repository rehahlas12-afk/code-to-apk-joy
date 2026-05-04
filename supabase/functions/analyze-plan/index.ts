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

    const systemPrompt = `Tu es un expert en extraction de données structurées à partir de photos de plans de dispatch/chargement de camions pour le transport STAF.

Le document est un tableau quadrillé (grille) avec des colonnes et des lignes. Chaque ligne contient :
- Un numéro de travée (2-3 chiffres, ou codes spéciaux comme 99BIS, DEB, DEB4)
- Un ou plusieurs numéros de magasin (4-5 chiffres)

Les zones sont :
- "Zone 1" : travées normales (généralement < 72)
- "Débord" : travées 72-86 quand rien n'est marqué, ou lignes marquées DEBORD/DEB
- "Craft" : travées 86-95 uniquement quand la ligne/case est marquée CRAFT/KRAFT/CRAFTER

INSTRUCTIONS CRITIQUES :
1. Parcours CHAQUE ligne du tableau, de haut en bas, de gauche à droite
2. Ne saute AUCUNE cellule — chaque numéro compte
3. Les numéros de magasin ont 4 ou 5 chiffres (ex: 8486, 10892, 6317)
4. Les numéros de travée ont 2-3 chiffres (ex: 72, 306, 94)
5. Retourne TOUS les magasins trouvés, même si tu n'es pas sûr à 100%
6. Si un numéro est partiellement lisible, donne ta meilleure estimation
7. ATTENTION : le numéro 86 peut exister deux fois. Si une case indique seulement "86" sans CRAFT, c'est "Débord". Si une autre case indique "86 CRAFT" ou "86 KRAFT", c'est une travée différente en "Craft". Ne mélange jamais ces deux travées.
8. Chaque travée 86 (Débord ou Craft) peut avoir son propre magasin unique. Ne copie pas le magasin de l'une vers l'autre.

Retourne le résultat UNIQUEMENT au format JSON, sans texte autour.`;

    const userPrompt = `Analyse ce plan de dispatch et extrais TOUS les numéros de magasin avec leur travée et zone.

Retourne un tableau JSON avec ce format exact :
[
  {"number": "8486", "travee": "72", "zone": "Débord"},
  {"number": "1111", "travee": "86", "zone": "Débord"},
  {"number": "2222", "travee": "86", "zone": "Craft"},
  {"number": "6317", "travee": "306", "zone": "Zone 1"}
]

Parcours systématiquement chaque ligne et chaque cellule du tableau. Ne rate aucun magasin.`;

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
    const validStores = stores
      .filter((s: any) => s.number && /^\d{4,5}$/.test(String(s.number).trim()))
      .map((s: any) => ({
        number: String(s.number).trim(),
        travee: String(s.travee || "?").trim(),
        zone: String(s.zone || "Zone 1").trim(),
      }));

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
