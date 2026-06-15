/**
 * AI Tools Index
 * 
 * Re-exports from modular tool files.
 * Maintains backward compatibility.
 * 
 * @serverOnly
 */

import { ToolResult, ToolContext, ToolParams } from "./types";
import { executeApolloSearch, APOLLO_TOOL_NAME, APOLLO_TOOL_DESCRIPTION } from "./apollo";
import { formatApolloCandidate } from "./apollo";
import { executeApolloCompanySearch, APOLLO_COMPANY_TOOL_NAME, APOLLO_COMPANY_TOOL_DESCRIPTION } from "./apollo-company";
import { formatApolloCompany } from "./apollo-company";
import { executeTavilySearch, TAVILY_TOOL_NAME, TAVILY_TOOL_DESCRIPTION } from "./tavily";
import { formatTavilyResult } from "./tavily";
import { executeInternalData, INTERNAL_TOOL_NAME, INTERNAL_TOOL_DESCRIPTION } from "./internal";
import { executeTool, getTools, getTool, hasTool, getToolDescription, TOOL_NAMES } from "./registry";

// ============================================================================
// Re-exports for backward compatibility
// ============================================================================

// Types
export type { ToolParams, ToolContext, ToolResult } from "./types";

// Apollo (People)
export { executeApolloSearch, APOLLO_TOOL_NAME, APOLLO_TOOL_DESCRIPTION } from "./apollo";
export type { ApolloSearchParams, ApolloSearchResultData, ApolloCandidate } from "./apollo";

// Apollo Company Search
export { executeApolloCompanySearch, APOLLO_COMPANY_TOOL_NAME, APOLLO_COMPANY_TOOL_DESCRIPTION } from "./apollo-company";
export type { ApolloCompanySearchParams, ApolloCompanySearchResultData, ApolloCompany } from "./apollo-company";

// Tavily
export { executeTavilySearch, TAVILY_TOOL_NAME, TAVILY_TOOL_DESCRIPTION } from "./tavily";
export type { TavilySearchParams, TavilySearchResultData, TavilyResult } from "./tavily";

// Internal
export { executeInternalData, INTERNAL_TOOL_NAME, INTERNAL_TOOL_DESCRIPTION } from "./internal";
export type { InternalDataType, InternalDataAction, InternalDataParams } from "./internal";

// Registry
export { executeTool, getTools, getTool, hasTool, getToolDescription, TOOL_NAMES };

// ============================================================================
// Legacy - Tool Registry for backward compatibility
// ============================================================================

export interface ToolDefinition {
  name: string;
  description: string;
  execute: (params: ToolParams, context: ToolContext) => Promise<ToolResult>;
}

// ============================================================================
// selectTools - Keyword-based tool selection
// ============================================================================

/**
 * Select appropriate tools based on user query
 * Uses keyword matching for simple tool selection
 * 
 * Returns array of tool names to invoke
 */
// ============================================================================
// Tool Schemas for MiniMax Tool Calling
// ============================================================================

/**
 * Get tool schemas in Anthropic/MiniMax format for tool calling
 * These schemas allow the LLM to decide which tools to use
 */
export function getToolSchemas(): Array<{
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}> {
  return [
    {
      name: "apollo",
      description: "Search for people, candidates, companies, or contacts. Use to find emails, phone numbers, LinkedIn profiles for recruiting or sales leads.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (job title, company, skills, industry)" },
          location: { type: "string", description: "Location filter (city, state)" },
          per_page: { type: "number", description: "Number of results (default 10)" },
        },
        required: ["query"],
      },
    },
    {
      name: "tavily",
      description: "Search the web for latest news, current events, weather, stock prices, or general information.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query for web search" },
          max_results: { type: "number", description: "Maximum number of results (default 5)" },
        },
        required: ["query"],
      },
    },
    {
      name: "internal_data",
      description: "Get the user's existing leads, clients, or pipeline data from the database.",
      input_schema: {
        type: "object",
        properties: {
          data_type: { type: "string", description: "Type: leads, clients, or pipeline" },
          action: { type: "string", description: "Action: list, get, or count" },
        },
        required: ["data_type"],
      },
    },
  ];
}

/**
 * Simple tool selection based on query analysis
 * This is the fallback when no tool calling is used
 * 
 * ENHANCED: Priority workflow for company research with contact info
 */
export function selectTools(query: string): string[] {
  const q = query.toLowerCase();
  const tools: string[] = [];
  
  // Company search keywords (business development) - ENHANCED for priority workflow
  const companyKeywords = [
    "company", "companies", "business", "businesses",
    "contractor", "contractors", "manufacturer", "manufacturers",
    "supplier", "suppliers", "vendor", "vendors",
    "startup", "startups", "enterprise",
    "organization", "organizations", "firm", "firms",
    "location", "sourcing", "prospects", "prospecting",
    "find companies", "find businesses", "search companies",
    "real estate", "construction", "manufacturing",
    // Priority workflow keywords - find companies in location/industry with contact info
    "in (city)", "in (state)", "located in", "based in",
    "industry", "sector", "contact info", "email", "phone"
  ];
  
  // Candidate/people search keywords (recruiting)
  const candidateKeywords = [
    "find", "search", "candidate", "candidates", "person", "people",
    "profile", "profiles", "developer", "engineer", "manager", "director",
    "recruiter", "hire", "hiring", "talent", "staff", "software",
    "python", "javascript", "react", "aws", "cloud", "data", "ai", "ml",
    "job", "resume", "experience", "skills", "team", "hired",
    "employee", "employees", "candidate"
  ];
  
  // Web search keywords
  const searchKeywords = [
    "news", "latest", "current", "today", "recent", 
    "what is", "who is", "when did", "how does", 
    "weather", "stock", "price"
  ];
  
  // Internal data keywords
  const internalKeywords = [
    "my leads", "my clients", "my pipeline", "our data",
    "existing", "current", "all", "list"
  ];
  
  // Add company search tool first (business development - priority workflow)
  // Check for company keywords + location combo for priority company search
  const hasCompanyKeywords = companyKeywords.some(kw => q.includes(kw));
  const hasLocationKeywords = ["in ", "located", "based in", "city", "state"].some(kw => q.includes(kw));
  
  if (hasCompanyKeywords || hasLocationKeywords) {
    tools.push(APOLLO_COMPANY_TOOL_NAME);
  }
  
  // Add people search tool (recruiting)
  if (candidateKeywords.some(kw => q.includes(kw))) {
    tools.push(APOLLO_TOOL_NAME);
  }
  
  // Add web search (general queries)
  if (searchKeywords.some(kw => q.includes(kw))) {
    tools.push(TAVILY_TOOL_NAME);
  }
  
  // Add internal data (if checking own data)
  if (internalKeywords.some(kw => q.includes(kw))) {
    tools.push(INTERNAL_TOOL_NAME);
  }
  
  return tools;
}

/**
 * Select tools based on query complexity for dynamic model routing
 * Used to determine if complex tool orchestration is needed
 * 
 * @param query - User query
 * @returns Array of tool names
 */
export function selectToolsByComplexity(query: string): string[] {
  // Use the main selectTools function
  return selectTools(query);
}

// ============================================================================
// formatToolResultsForAI - Format results for LLM consumption
// ============================================================================

/**
 * Format tool results for AI messages
 */
export function formatToolResultsForAI(results: Record<string, ToolResult>): {
  toolResultsText: string;
  hasData: boolean;
} {
  const parts: string[] = [];
  let hasData = false;
  
  // Apollo results
  if (results.apollo?.success && results.apollo.data) {
    const data = results.apollo.data as { candidates?: unknown[] };
    if (data.candidates?.length) {
      hasData = true;
      // Import format function from apollo module
      const { formatApolloCandidate } = require("./apollo");
      const formatted = data.candidates.slice(0, 10).map((p: unknown) => 
        typeof p === 'object' ? formatApolloCandidate(p as any) : String(p)
      );
      parts.push(`Candidate Results:\n${formatted.join("\n\n")}`);
    }
  }
  
  // Tavily results
  if (results.tavily?.success && results.tavily.data) {
    const data = results.tavily.data as { results?: unknown[] };
    if (data.results?.length) {
      hasData = true;
      const { formatTavilyResult } = require("./tavily");
      const formatted = data.results.map((r: unknown, i: number) => 
        typeof r === 'object' ? formatTavilyResult(r as any, i) : String(r)
      );
      parts.push(`Search Results:\n${formatted.join("\n\n")}`);
    }
  }
  
  // Internal results
  if (results.internal_data?.success && results.internal_data.data) {
    hasData = true;
    parts.push(`Internal Data: ${JSON.stringify(results.internal_data.data)}`);
  }
  
  return {
    toolResultsText: parts.join("\n\n"),
    hasData,
  };
}

// ============================================================================
// TOOL_REGISTRY - Legacy export for backward compatibility
// ============================================================================

/**
 * @deprecated Use getTool() instead
 */
export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  apollo: {
    name: APOLLO_TOOL_NAME,
    description: APOLLO_TOOL_DESCRIPTION,
    execute: executeApolloSearch,
  },
  tavily: {
    name: TAVILY_TOOL_NAME,
    description: TAVILY_TOOL_DESCRIPTION,
    execute: executeTavilySearch,
  },
  internal_data: {
    name: INTERNAL_TOOL_NAME,
    description: INTERNAL_TOOL_DESCRIPTION,
    execute: executeInternalData,
  },
};
