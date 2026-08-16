/**
 * AI external tool feature flags
 *
 * Apollo + Tavily backends live in the repo (APIs, execute handlers, registry).
 * Code is kept so Apollo can be re-enabled without a rewrite.
 *
 * Defaults:
 *   - Apollo: ON when a platform Apollo key is present, unless
 *     AI_TOOLS_APOLLO_ENABLED=false. Explicit true always on.
 *   - Tavily: OFF (set AI_TOOLS_TAVILY_ENABLED=true to enable)
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

function platformApolloKeyPresent(): boolean {
  const key = (
    process.env.APOLLO_API_KEY ||
    process.env.Apollo_API_key ||
    process.env.APOLLO_API_key ||
    process.env.apollo_api_key ||
    ""
  ).trim();
  return key.length > 10;
}

/**
 * Apollo people / company / lookup tools for the AI assistant.
 * Hard off: AI_TOOLS_APOLLO_ENABLED=false.
 * Otherwise on when the public flag is true or a platform Apollo key exists.
 */
export function isApolloToolEnabled(): boolean {
  const t = envTriState("AI_TOOLS_APOLLO_ENABLED");
  if (t === "false") return false;
  if (t === "true") return true;
  const pub = envTriState("NEXT_PUBLIC_AI_TOOLS_APOLLO_ENABLED");
  if (pub === "true") return true;
  if (pub === "false") return false;
  return platformApolloKeyPresent();
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
  "apollo_lookup",
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
  const n = (toolName || "").toLowerCase();
  if (n.includes("apollo")) {
    return (
      `Apollo search is currently disabled. ` +
      `Re-enable with AI_TOOLS_APOLLO_ENABLED=true (and NEXT_PUBLIC_AI_TOOLS_APOLLO_ENABLED=true for the UI). ` +
      `Use internal_data for ATS records, fetch_website for a URL, or CRM write tools to save people/companies.`
    );
  }
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
