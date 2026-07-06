import { defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import analyzePlanTool from "./tools/analyze-plan";

export default defineMcp({
  name: "staf-transport-mcp",
  title: "STAF Transport MCP",
  version: "0.1.0",
  instructions:
    "Tools for the STAF Transport dispatch app. Use `echo` to verify connectivity. Use `analyze_plan` to extract store numbers, travées and zones from a photo of a warehouse plan.",
  tools: [echoTool, analyzePlanTool],
});
