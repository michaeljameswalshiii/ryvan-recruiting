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
import { executeTavilySearch, TAVILY_TOOL_NAME, TAVILY_TOOL_DESCRIPTION } from "./tavily";
import { formatTavilyResult } from "./tavily";
import { executeInternalData, INTERNAL_TOOL_NAME, INTERNAL_TOOL_DESCRIPTION } from "./internal";
import { executeTool, getTools, getTool, hasTool, getToolDescription, TOOL_NAMES } from "./registry";

// ============================================================================
// Re-exports for backward compatibility
// ============================================================================

// Types
export type { ToolParams, ToolContext, ToolResult } from "./types";

// Apollo
export { executeApolloSearch, APOLLO_TOOL_NAME, APOLLO_TOOL_DESCRIPTION } from "./apollo";
export type { ApolloSearchParams, ApolloSearchResultData, ApolloCandidate } from "./apollo";

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
export function selectTools(query: string): string[] {
  const q = query.toLowerCase();
  const tools: string[] = [];
  
  // Candidate/people search keywords
  const candidateKeywords = [
    "find", "search", "candidate", "candidates", "person", "people",
    "profile", "profiles", "developer", "engineer", "manager", "director",
    "recruiter", "hire", "hiring", "talent", "staff", "software",
    "python", "javascript", "react", "aws", "cloud", "data", "ai", "ml",
    "job", "resume", "experience", "skills", "team", "hired"
  ];
  
  // Web search keywords
  const searchKeywords = [
    "news", "latest", "current", "today", "recent", 
    "what is", "who is", "when did", "how does", 
    "weather", "stock", "price",
    "company", "companies", "contractor", "manufacturer", "supplier"
  ];
  
  // Internal data keywords
  const internalKeywords = [
    "my leads", "my clients", "my pipeline", "our data",
    "existing", "current", "all", "list"
  ];
  
  // Add tools based on keywords
  if (candidateKeywords.some(kw => q.includes(kw))) {
    tools.push(APOLLO_TOOL_NAME);
  }
  
  if (searchKeywords.some(kw => q.includes(kw))) {
    tools.push(TAVILY_TOOL_NAME);
  }
  
  if (internalKeywords.some(kw => q.includes(kw))) {
    tools.push(INTERNAL_TOOL_NAME);
  }
  
  return tools;
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
