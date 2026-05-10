/**
 * AI Tools Index
 * 
 * Registry of all available AI tools (search, data access, etc.)
 * Used by the Bedrock AI route for tool orchestration
 * 
 * Features:
 * - Type-safe tool definitions
 * - Tool metadata for LLM selection
 * - Proper error handling per tool
 * - Tenant isolation for data tools
 * 
 * @serverOnly
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Base tool result interface
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Tool definition with metadata
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ToolDefinition {
  name: string;
  description: string;
  execute: (input: any, context: ToolContext) => Promise<ToolResult>;
}

/**
 * Execution context passed to all tools
 */
export interface ToolContext {
  tenantId: string | null;
  userId: string | null;
  requestUrl?: string;
}

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * Tool registry map - all available tools
 */
export const TOOL_REGISTRY: Record<string, ToolDefinition> = {};

// ============================================================================
// Base Tool Functions
// ============================================================================

/**
 * Format Apollo person result for AI consumption
 */
function formatApolloPerson(person: Record<string, unknown>): string {
  const name = person.name || "Unknown";
  const title = person.title || "";
  const org = person.organization || "";
  const email = person.email || "N/A";
  const phone = person.phone || "N/A";
  const linkedin = person.linkedin_url || "N/A";
  const headline = person.headline || "";
  
  return `${name}${title ? ` - ${title}` : ""}${org ? ` at ${org}` : ""}\nEmail: ${email}\nPhone: ${phone}\nLinkedIn: ${linkedin}${headline ? `\n${headline}` : ""}`;
}

/**
 * Format Tavily search result
 */
function formatTavilyResult(result: Record<string, unknown>, index: number): string {
  const title = result.title || "";
  const snippet = result.snippet || "";
  const url = result.url || "";
  
  return `${index + 1}. ${title}\n${snippet}${url ? `\n${url}` : ""}`;
}

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * Apollo Search Tool - Primary candidate sourcing
 * 
 * Input: { query: string, per_page?: number, location?: string }
 * Output: ToolResult with candidates array
 */
async function executeApolloSearch(
  input: { query: string; per_page?: number; location?: string },
  context: ToolContext
): Promise<ToolResult> {
  try {
    const baseUrl = context.requestUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    
    const response = await fetch(`${baseUrl}/api/apollo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      if (errorText.includes("free plan") || errorText.includes("API_INACCESSIBLE") || status === 403) {
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
        },
        metadata: { source: "apollo" }
      };
    }
    
    return { 
      success: true, 
      data: { candidates: [], count: 0 },
      metadata: { source: "apollo" }
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
 * Tavily Search Tool - Secondary web search
 * 
 * Input: { query: string, max_results?: number }
 * Output: ToolResult with search results array
 */
async function executeTavilySearch(
  input: { query: string; max_results?: number },
  context: ToolContext
): Promise<ToolResult> {
  try {
    const baseUrl = context.requestUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    
    const response = await fetch(`${baseUrl}/api/tavily`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      },
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
 * Internal Data Tool - Access tenant's own data
 * 
 * Input: { data_type: "leads" | "clients" | "pipeline", action: "list" | "get", id?: string }
 * Output: ToolResult with data array or single item
 */
async function executeInternalData(
  input: { 
    data_type: "leads" | "clients" | "pipeline"; 
    action: "list" | "get"; 
    id?: string;
  },
  context: ToolContext
): Promise<ToolResult> {
  // Ensure tenant isolation - NEVER allow access without tenant
  if (!context.tenantId) {
    return {
      success: false,
      error: "Tenant context required for internal data access",
      metadata: { reason: "no_tenant" }
    };
  }
  
  try {
    const baseUrl = context.requestUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    let endpoint = "";
    
    // Build endpoint based on data type and action
    switch (input.data_type) {
      case "leads":
        endpoint = input.id ? `/api/data/leads/${input.id}` : "/api/data/leads";
        break;
      case "clients":
        endpoint = input.id ? `/api/data/clients/${input.id}` : "/api/data/clients";
        break;
      case "pipeline":
        endpoint = input.id ? `/api/data/pipeline/${input.id}` : "/api/data/pipeline";
        break;
      default:
        return { success: false, error: "Invalid data type" };
    }
    
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "GET",
      headers: { 
        "Content-Type": "application/json",
        // Tenant ID passed via headers (set by middleware)
        "x-tenant-id": context.tenantId,
      },
    });
    
    if (!response.ok) {
      return { 
        success: false, 
        error: `Internal API error: ${response.status}`,
        metadata: { status: response.status }
      };
    }
    
    const data = await response.json();
    return { 
      success: true, 
      data,
      metadata: { source: "internal", tenantId: context.tenantId }
    };
    
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Internal data error:", errorMessage);
    return { 
      success: false, 
      error: errorMessage,
      metadata: { type: "exception" }
    };
  }
}

// ============================================================================
// Tool Registry Registration
// ============================================================================

/**
 * Register all tools in the registry
 */
export function registerTools(): void {
  // Apollo search tool
  TOOL_REGISTRY["apollo"] = {
    name: "apollo",
    description: "Search for candidates/people using Apollo.io API. Use for finding software engineers, managers, and other tech talent.",
    execute: executeApolloSearch,
  };
  
  // Tavily search tool
  TOOL_REGISTRY["tavily"] = {
    name: "tavily",
    description: "Search the web for current information, news, and latest updates. Use for research and fact-finding.",
    execute: executeTavilySearch,
  };
  
  // Internal data tool
  TOOL_REGISTRY["internal_data"] = {
    name: "internal_data",
    description: "Access your organization's internal data (leads, clients, pipeline). Requires tenant authentication.",
    execute: executeInternalData,
  };
}

// Initialize tool registry
registerTools();

// ============================================================================
// Tool Selection Helper
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
    tools.push("apollo");
  }
  
  if (searchKeywords.some(kw => q.includes(kw))) {
    tools.push("tavily");
  }
  
  if (internalKeywords.some(kw => q.includes(kw))) {
    tools.push("internal_data");
  }
  
  return tools;
}

// ============================================================================
// Execution Helper
// ============================================================================

/**
 * Execute a tool by name
 */
export async function executeTool(
  toolName: string,
  input: unknown,
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
    return await tool.execute(input, context);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Tool execution failed";
    return {
      success: false,
      error: errorMessage,
    };
  }
}

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
    const data = results.apollo.data as { candidates?: Record<string, unknown>[] };
    if (data.candidates?.length) {
      hasData = true;
      const formatted = data.candidates.slice(0, 10).map(p => formatApolloPerson(p));
      parts.push(`Candidate Results:\n${formatted.join("\n\n")}`);
    }
  }
  
  // Tavily results
  if (results.tavily?.success && results.tavily.data) {
    const data = results.tavily.data as { results?: Record<string, unknown>[] };
    if (data.results?.length) {
      hasData = true;
      const formatted = data.results.map((r, i) => formatTavilyResult(r, i));
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
