/**
 * Tool Registry
 * 
 * Aggregates all AI tools and provides unified execution interface.
 * 
 * @serverOnly
 */

import { ToolDefinition, ToolParams, ToolContext, ToolResult } from "./types";
import { executeApolloSearch, APOLLO_TOOL_NAME, APOLLO_TOOL_DESCRIPTION } from "./apollo";
import { executeApolloCompanySearch, APOLLO_COMPANY_TOOL_NAME, APOLLO_COMPANY_TOOL_DESCRIPTION } from "./apollo-company";
import { executeTavilySearch, TAVILY_TOOL_NAME, TAVILY_TOOL_DESCRIPTION } from "./tavily";
import { executeInternalData, INTERNAL_TOOL_NAME, INTERNAL_TOOL_DESCRIPTION } from "./internal";

// ============================================================================
// Registry
// ============================================================================

/**
 * Tool registry map
 */
const TOOL_REGISTRY: Record<string, ToolDefinition> = {};

/**
 * Initialize registry with all tools
 */
function initializeRegistry(): void {
  // Apollo people search tool
  TOOL_REGISTRY[APOLLO_TOOL_NAME] = {
    name: APOLLO_TOOL_NAME,
    description: APOLLO_TOOL_DESCRIPTION,
    execute: executeApolloSearch,
  };
  
  // Apollo company search tool
  TOOL_REGISTRY[APOLLO_COMPANY_TOOL_NAME] = {
    name: APOLLO_COMPANY_TOOL_NAME,
    description: APOLLO_COMPANY_TOOL_DESCRIPTION,
    execute: executeApolloCompanySearch,
  };
  
  // Tavily search tool
  TOOL_REGISTRY[TAVILY_TOOL_NAME] = {
    name: TAVILY_TOOL_NAME,
    description: TAVILY_TOOL_DESCRIPTION,
    execute: executeTavilySearch,
  };
  
  // Internal data tool
  TOOL_REGISTRY[INTERNAL_TOOL_NAME] = {
    name: INTERNAL_TOOL_NAME,
    description: INTERNAL_TOOL_DESCRIPTION,
    execute: executeInternalData,
  };
}

// Initialize on module load
initializeRegistry();

// ============================================================================
// Exports
// ============================================================================

/**
 * Get all registered tools
 */
export function getTools(): Record<string, ToolDefinition> {
  return TOOL_REGISTRY;
}

/**
 * Get tool by name
 */
export function getTool(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY[name];
}

/**
 * Execute tool by name
 */
export async function executeTool(
  toolName: string,
  params: ToolParams,
  context: ToolContext
): Promise<ToolResult> {
  const tool = TOOL_REGISTRY[toolName];
  
  if (!tool) {
    return {
      success: false,
      error: `Tool not found: ${toolName}`,
    };
  }
  
  try {
    return await tool.execute(params, context);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Tool execution failed";
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Get tool names for keyword-based selection
 */
export const TOOL_NAMES = {
  apollo: APOLLO_TOOL_NAME,
  apolloCompany: APOLLO_COMPANY_TOOL_NAME,
  tavily: TAVILY_TOOL_NAME,
  internal: INTERNAL_TOOL_NAME,
} as const;

/**
 * Check if tool exists
 */
export function hasTool(name: string): boolean {
  return name in TOOL_REGISTRY;
}

/**
 * Get tool description
 */
export function getToolDescription(name: string): string | undefined {
  return TOOL_REGISTRY[name]?.description;
}
