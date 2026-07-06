import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "analyze_plan",
  title: "Analyze warehouse plan image",
  description:
    "Extract store numbers, travées and zones (Zone 1 / Débord / Craft) from a photo of a STAF Transport warehouse plan. Provide the image as a data URL (data:image/...;base64,...) or a public https URL.",
  inputSchema: {
    imageUrl: z
      .string()
      .min(10)
      .describe("Image as a data URL (data:image/png;base64,...) or a public https:// URL."),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  handler: async ({ imageUrl }) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return {
        content: [{ type: "text", text: "Backend not configured." }],
        isError: true,
      };
    }
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/analyze-plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ image: imageUrl }),
      });
      const text = await res.text();
      if (!res.ok) {
        return {
          content: [{ type: "text", text: `analyze-plan failed (${res.status}): ${text}` }],
          isError: true,
        };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      return {
        content: [{ type: "text", text: typeof parsed === "string" ? parsed : JSON.stringify(parsed) }],
        structuredContent: typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : undefined,
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
});
