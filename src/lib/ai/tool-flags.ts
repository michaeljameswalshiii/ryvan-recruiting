/**
 * AI external tool feature flags
 *
 * Apollo + Tavily backends live in the repo (APIs, execute handlers, registry).
 *
 * Defaults (2026-07):
 *   - Apollo: ON (people/company search for AI Assistant)
 *   - Tavily: OFF (re-enable with AI_TOOLS_TAVILY_ENABLED=true)
 *
 * Override via Vercel env:
 *   AI_TOOLS_APOLLO_ENABLED=false  → force Apollo off
 *   AI_TOOLS_TAVILY_ENABLED=true   → force Tavily on
 *   AI_TOOLS_TAVILY_ENABLED=false  → keep Tavily off (default)
 *
 * @serverOnly
 */

function envTriState(name: string): "true" | "false" | "unset" {
  const v = (process.env[name] || "").trim().toLowerCase();
  if (!v) return "unset";
  if (v === "1" || v === "true" || v === "yes" || v === "on") return "true";
  if (v === "0" || v === "false" || v === "no" || v === "off") return "false";
  return "unset";
}

/**
 * Apollo people + company search tools for the AI assistant.
 * Default ON; set AI_TOOLS_APOLLO_ENABLED=false to disable.
 */
export function isApolloToolEnabled(): boolean {
  const t = envTriState("AI_TOOLS_APOLLO_ENABLED");
  if (t === "false") return false;
  if (t === "true") return true;
  return true; // default on
}

/**
 * Tavily web search tool for the AI assistant.
 * Default OFF; set AI_TOOLS_TAVILY_ENABLED=true to enable.
 */
export function isTavilyToolEnabled(): boolean {
  const t = envTriState("AI_TOOLS_TAVILY_ENABLED");
  if (t === "false") return false;
  if (t === "true") return true;
  return false; // default off
}

const APOLLO_NAMES = new Set([
  "apollo",
  "apollo_people",
  "apollo_company_search",
  "apollo_company",
]);

const TAVILY_NAMES = new Set(["tavily"]);

/** True if this tool name is currently disabled for assistant use */
export function isExternalToolDisabled(toolName: string): boolean {
  const n = (toolName || "").toLowerCase();
  if (APOLLO_NAMES.has(n) && !isApolloToolEnabled()) return true;
  if (TAVILY_NAMES.has(n) && !isTavilyToolEnabled()) return true;
  return false;
}

export function disabledExternalToolMessage(toolName: string): string {
  return (
    `The "${toolName}" tool is temporarily disabled in the AI Assistant. ` +
    `Set AI_TOOLS_APOLLO_ENABLED / AI_TOOLS_TAVILY_ENABLED on the server to change. ` +
    `Use internal_data for ATS records, fetch_website for a specific URL, ` +
    `or CRM write tools when the user wants to save data.`
  );
}

/** Filter tool schemas / name lists when building model tool lists */
export function filterEnabledToolSchemas<T extends { name: string }>(
  tools: T[]
): T[] {
  return tools.filter((t) => !isExternalToolDisabled(t.name));
}

export function filterEnabledToolNames(names: string[]): string[] {
  return names.filter((n) => !isExternalToolDisabled(n));
}
