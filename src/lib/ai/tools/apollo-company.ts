/**
 * Apollo Company Search Tool
 * 
 * Search for companies using Apollo.io API for business development.
 * 
 * @serverOnly
 */

import { ToolResult, ToolContext, ToolParams } from "./types";

/**
 * Tool metadata
 */
export const APOLLO_COMPANY_TOOL_NAME = "apollo_company_search";
export const APOLLO_COMPANY_TOOL_DESCRIPTION = 
  "Search for companies using Apollo. Best for business development sourcing. Use when user wants to find companies, businesses, or organizations.";

/**
 * Apollo company search input parameters
 */
export interface ApolloCompanySearchParams {
  keyword: string;
  location: string;
  employeeRange?: string;
  maxResults?: number;
}

/**
 * Apollo company search result data
 */
export interface ApolloCompanySearchResultData {
  companies: ApolloCompany[];
  count: number;
  total?: number;
}

/**
 * Apollo company
 */
export interface ApolloCompany {
  id: string;
  name: string;
  domain?: string;
  linkedin_url?: string;
  city?: string;
  state?: string;
  country?: string;
  employee_count?: number;
  industry?: string;
}

/**
 * Execute Apollo company search
 * 
 * @param params - Search parameters (keyword, location, employeeRange, maxResults)
 * @param context - Tool execution context
 * @returns ToolResult with companies or error
 */
export async function executeApolloCompanySearch(
  params: ToolParams,
  context: ToolContext
): Promise<ToolResult> {
  // Parse input with type guard
  const rawParams = params as Record<string, unknown>;
  const input: ApolloCompanySearchParams = {
    keyword: String(rawParams.keyword || rawParams.query || ""),
    location: String(rawParams.location || ""),
    employeeRange: rawParams.employeeRange ? String(rawParams.employeeRange) : undefined,
    maxResults: rawParams.maxResults ? Number(rawParams.maxResults) : undefined,
  };
  
  if (!input.keyword) {
    return {
      success: false,
      error: "Keyword is required for company search",
    };
  }
  
  if (!input.location) {
    return {
      success: false,
      error: "Location is required for company search",
    };
  }
  
  try {
    const baseUrl = context.requestUrl || 
      process.env.NEXT_PUBLIC_APP_URL || 
      "http://localhost:3001";
    
    // Build search payload
    const payload = {
      q: input.keyword,
      location: input.location,
      organization_num_employees_ranges: input.employeeRange ? [input.employeeRange] : ["1-100"],
      per_page: input.maxResults || 15,
    };
    
    // Make API call to company search endpoint
    const response = await fetch(`${baseUrl}/api/apollo/search`, {
      method: "POST",
      headers: new Headers({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      const status = response.status;
      const errorText = await response.text().catch(() => "");
      
      if (status === 429 || status >= 500) {
        return { 
          success: false, 
          error: `Apollo unavailable (${status})`,
          metadata: { status }
        };
      }
      
      return { 
        success: false, 
        error: `Apollo error: ${status} - ${errorText}`,
        metadata: { status }
      };
    }
    
    const data = await response.json();
    
    // Extract companies from response
    const orgs = data.organizations || data.accounts || [];
    
    if (orgs.length > 0) {
      const companies: ApolloCompany[] = orgs.map((org: any) => ({
        id: org.id || String(Math.random()),
        name: org.name,
        domain: org.domain,
        linkedin_url: org.linkedin_url,
        city: org.city,
        state: org.state,
        country: org.country,
        employee_count: org.employee_count,
        industry: org.industry || input.keyword,
      }));
      
      return { 
        success: true, 
        data: {
          companies,
          count: companies.length,
          total: data.total,
        } as ApolloCompanySearchResultData,
        metadata: { source: "apollo_company_search", tenantId: context.tenantId }
      };
    }
    
    return { 
      success: true, 
      data: { companies: [], count: 0 } as ApolloCompanySearchResultData,
      metadata: { source: "apollo_company_search", tenantId: context.tenantId }
    };
    
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Apollo company search error:", errorMessage);
    return { 
      success: false, 
      error: errorMessage,
      metadata: { type: "exception" }
    };
  }
}

/**
 * Format Apollo company for AI consumption
 */
export function formatApolloCompany(company: ApolloCompany): string {
  const parts = [
    company.name,
    company.industry ? `(${company.industry})` : "",
  ].filter(Boolean);
  
  const lines = [
    parts.join(" "),
    `Location: ${company.city || "N/A"}, ${company.state || ""}`,
    `Employees: ${company.employee_count || "N/A"}`,
    `Website: ${company.domain || "N/A"}`,
    `LinkedIn: ${company.linkedin_url || "N/A"}`,
  ];
  
  return lines.join("\n");
}

/**
 * Check if Apollo company search is available
 */
export async function checkApolloCompanyAvailability(): Promise<string | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    
    // Try a simple test query
    const response = await fetch(`${baseUrl}/api/apollo/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: "test",
        location: "Boca Raton, FL",
        per_page: 1,
      }),
    });
    
    if (!response.ok) {
      const status = response.status;
      return `Apollo company search unavailable (${status})`;
    }
    
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Apollo check failed";
  }
}
