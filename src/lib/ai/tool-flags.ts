/**
 * AI external tool feature flags
 *
 * Apollo + Tavily backends stay in the repo (APIs, execute handlers, registry).
 * The AI Assistant does not offer them unless re-enabled via env.
 *
 * Re-enable later (Vercel env or local):
 *   AI_TOOLS_APOLLO_ENABLED=true
 *   AI_TOOLS_TAVILY_ENABLED=true
 *
 * @serverOnly
 */

function envEnabled(name: string): boolean {
  const v = (process.env[name] || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Apollo people + company search tools for the AI assistant */
export function isApolloToolEnabled(): boolean {
  return envEnabled("AI_TOOLS_APOLLO_ENABLED");
}

/** Tavily web search tool for the AI assistant */
export function isTavilyToolEnabled(): boolean {
  return envEnabled("AI_TOOLS_TAVILY_ENABLED");
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
    `Backend support remains available for later re-enablement ` +
    `(set AI_TOOLS_APOLLO_ENABLED / AI_TOOLS_TAVILY_ENABLED). ` +
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
