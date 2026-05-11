/**
 * Tavily Search Tool
 * 
 * Clean implementation with proper tenant isolation.
 * 
 * @serverOnly
 */

import { ToolResult, ToolContext, ToolParams } from "./types";

/**
 * Tool metadata
 */
export const TAVILY_TOOL_NAME = "tavily";
export const TAVILY_TOOL_DESCRIPTION = 
  "Search the web for current information, news, and latest updates. Use for research and fact-finding.";

/**
 * Tavily search input parameters
 */
export interface TavilySearchParams {
  query: string;
  max_results?: number;
}

/**
 * Tavily search result data
 */
export interface TavilySearchResultData {
  results: TavilyResult[];
  count: number;
}

/**
 * Tavily result
 */
export interface TavilyResult {
  title: string;
  snippet: string;
  url?: string;
}

/**
 * Execute Tavily search
 * 
 * @param params - Search parameters
 * @param context - Tool execution context
 * @returns ToolResult with search results or error
 */
export async function executeTavilySearch(
  params: ToolParams,
  context: ToolContext
): Promise<ToolResult> {
  // Parse input
  const input = params as TavilySearchParams;
  
  if (!input.query) {
    return {
      success: false,
      error: "Query is required",
    };
  }
  
  try {
    const baseUrl = context.requestUrl || 
      process.env.NEXT_PUBLIC_APP_URL || 
      "http://localhost:3001";
    
    // Make API call
    const response = await fetch(`${baseUrl}/api/tavily`, {
      method: "POST",
      headers: new Headers({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        query: input.query,
        max_results: input.max_results || 5,
      }),
    });
    
    if (!response.ok) {
      return { 
        success: false, 
        error: `Tavily error: ${response.status}`,
        metadata: { status: response.status }
      };
    }
    
    const data = await response.json();
    
    return { 
      success: true, 
      data: {
        results: data.results || [],
        count: data.results?.length || 0,
      } as TavilySearchResultData,
      metadata: { source: "tavily" }
    };
    
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Tavily search error:", errorMessage);
    return { 
      success: false, 
      error: errorMessage,
      metadata: { type: "exception" }
    };
  }
}

/**
 * Format Tavily result for AI consumption
 */
export function formatTavilyResult(result: TavilyResult, index: number): string {
  const lines = [
    `${index + 1}. ${result.title}`,
    result.snippet,
  ];
  
  if (result.url) {
    lines.push(result.url);
  }
  
  return lines.join("\n");
}
