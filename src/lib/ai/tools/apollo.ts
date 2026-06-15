/**
 * Apollo Search Tool
 * 
 * Clean implementation with proper tenant isolation.
 * 
 * @serverOnly
 */

import { ToolResult, ToolContext, ToolParams } from "./types";

/**
 * Tool metadata
 */
export const APOLLO_TOOL_NAME = "apollo";
export const APOLLO_TOOL_DESCRIPTION = 
  "Search for candidates/people using Apollo.io API. Use for finding software engineers, managers, and other tech talent.";

/**
 * Apollo search input parameters
 */
export interface ApolloSearchParams {
  query: string;
  per_page?: number;
  location?: string;
}

/**
 * Apollo search result data
 */
export interface ApolloSearchResultData {
  candidates: ApolloCandidate[];
  count: number;
  total?: number;
}

/**
 * Apollo candidate
 */
export interface ApolloCandidate {
  id: string;
  name: string;
  title?: string;
  organization?: string;
  linkedin_url?: string;
  email?: string;
  phone?: string;
  location?: string;
  headline?: string;
}

/**
 * Execute Apollo search
 * 
 * @param params - Search parameters
 * @param context - Tool execution context (must include tenantId)
 * @returns ToolResult with candidates or error
 */
export async function executeApolloSearch(
  params: ToolParams,
  context: ToolContext
): Promise<ToolResult> {
  // Parse input
  const input = params as ApolloSearchParams;
  
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
    const response = await fetch(`${baseUrl}/api/apollo`, {
      method: "POST",
      headers: new Headers({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        query: input.query,
        per_page: input.per_page || 10,
        location: input.location,
      }),
    });
    
    if (!response.ok) {
      const status = response.status;
      const errorText = await response.text().catch(() => "");
      
      // Check for free plan limitation
      if (
        errorText.includes("free plan") || 
        errorText.includes("API_INACCESSIBLE") || 
        status === 403
      ) {
        return { 
          success: false, 
          error: "Apollo free plan does not include people search API access",
          metadata: { status, plan: "free" }
        };
      }
      
      if (status === 429 || status >= 500) {
        return { 
          success: false, 
          error: `Apollo unavailable (${status})`,
          metadata: { status }
        };
      }
      
      return { 
        success: false, 
        error: `Apollo error: ${status}`,
        metadata: { status }
      };
    }
    
    const data = await response.json();
    
    if (data.success && data.results?.length > 0) {
      return { 
        success: true, 
        data: {
          candidates: data.results,
          count: data.count,
          total: data.total,
        } as ApolloSearchResultData,
        metadata: { source: "apollo", tenantId: context.tenantId }
      };
    }
    
    return { 
      success: true, 
      data: { candidates: [], count: 0 } as ApolloSearchResultData,
      metadata: { source: "apollo", tenantId: context.tenantId }
    };
    
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Apollo search error:", errorMessage);
    return { 
      success: false, 
      error: errorMessage,
      metadata: { type: "exception" }
    };
  }
}

/**
 * Format Apollo candidate for AI consumption
 */
export function formatApolloCandidate(person: ApolloCandidate): string {
  const parts = [
    person.name,
    person.title ? `- ${person.title}` : "",
    person.organization ? ` at ${person.organization}` : "",
  ].filter(Boolean);
  
  const lines = [
    parts.join(" "),
    `Email: ${person.email || "N/A"}`,
    `Phone: ${person.phone || "N/A"}`,
    `LinkedIn: ${person.linkedin_url || "N/A"}`,
  ];
  
  if (person.headline) {
    lines.push(person.headline);
  }
  
  return lines.join("\n");
}

/**
 * Check if Apollo is available
 * Returns error message if not available, null if available
 */
export async function checkApolloAvailability(): Promise<string | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    
    // Try a simple test query
    const response = await fetch(`${baseUrl}/api/apollo`, {
      method: "POST",
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ query: "test" }),
    });
    
    if (!response.ok) {
      const status = response.status;
      const errorText = await response.text().catch(() => "");
      
      if (errorText.includes("free plan") || status === 403) {
        return "Apollo free plan does not include API access";
      }
      
      return `Apollo unavailable (${status})`;
    }
    
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Apollo check failed";
  }
}
