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
import {
  executeFetchWebsite,
  FETCH_WEBSITE_TOOL_NAME,
  FETCH_WEBSITE_TOOL_DESCRIPTION,
  formatFetchWebsiteResult,
} from "./fetch-website";
import { executeInternalData, INTERNAL_TOOL_NAME, INTERNAL_TOOL_DESCRIPTION } from "./internal";
import { CRM_WRITE_TOOLS } from "./crm-write";
import {
  executeGenerateFile,
  GENERATE_FILE_TOOL_NAME,
  GENERATE_FILE_TOOL_DESCRIPTION,
} from "./generate-file";
import { executeTool, getTools, getTool, hasTool, getToolDescription, TOOL_NAMES } from "./registry";
import {
  filterEnabledToolNames,
  filterEnabledToolSchemas,
  isApolloToolEnabled,
  isTavilyToolEnabled,
} from "@/lib/ai/tool-flags";

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

// Fetch website (direct URL read)
export {
  executeFetchWebsite,
  FETCH_WEBSITE_TOOL_NAME,
  FETCH_WEBSITE_TOOL_DESCRIPTION,
  formatFetchWebsiteResult,
} from "./fetch-website";
export type {
  FetchWebsiteParams,
  FetchWebsiteResultData,
} from "./fetch-website";

// Internal
export { executeInternalData, INTERNAL_TOOL_NAME, INTERNAL_TOOL_DESCRIPTION } from "./internal";
export type { InternalDataType, InternalDataAction, InternalDataParams } from "./internal";

// CRM write tools
export { CRM_WRITE_TOOLS } from "./crm-write";

// File generation / downloads
export {
  executeGenerateFile,
  GENERATE_FILE_TOOL_NAME,
  GENERATE_FILE_TOOL_DESCRIPTION,
  extractGeneratedFileFromToolData,
} from "./generate-file";
export type { GeneratedFilePayload } from "./generate-file";

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
  // Full catalog stays defined; Apollo/Tavily filtered unless AI_TOOLS_*_ENABLED=true
  const all: Array<{
    name: string;
    description: string;
    input_schema: {
      type: string;
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  }> = [
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
      name: "fetch_website",
      description:
        "Fetch and read a public website by URL. Use when the user provides a company website or asks you to examine a page.",
      input_schema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Full URL or domain (e.g. https://acme.com or acme.com/about)",
          },
          query: {
            type: "string",
            description: "Optional alias for url if you only have one string field",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "generate_file",
      description:
        "Create a downloadable file (docx, xlsx, csv, md, txt, json, html). Use when the user wants a document, spreadsheet, export, or attachment. The app shows a Download button — never say you cannot create files.",
      input_schema: {
        type: "object",
        properties: {
          format: {
            type: "string",
            description: "docx | xlsx | csv | md | txt | json | html",
          },
          file_name: {
            type: "string",
            description: "File name with or without extension, e.g. interview-prep.docx",
          },
          content: {
            type: "string",
            description:
              "Full file body. For xlsx you may pass JSON: {\"headers\":[...],\"rows\":[[...]]} or {\"sheets\":[...]}",
          },
          title: {
            type: "string",
            description: "Optional document title (docx heading)",
          },
        },
        required: ["format", "content"],
      },
    },
    {
      name: "internal_data",
      description:
        "Read ATS data: leads/candidates, clients, jobs, pipeline. action list|get.",
      input_schema: {
        type: "object",
        properties: {
          data_type: {
            type: "string",
            description: "leads | candidates | clients | jobs | pipeline",
          },
          action: { type: "string", description: "list, get, or count" },
          id: { type: "string", description: "id when action is get" },
        },
        required: ["data_type"],
      },
    },
    ...CRM_WRITE_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.schema,
    })),
    {
      name: "score_candidate_fit",
      description:
        "Score how well a candidate fits a job (0-100 + grade + reasons). Params: job_id, candidate_id.",
      input_schema: {
        type: "object",
        properties: {
          job_id: { type: "string", description: "Job id" },
          candidate_id: { type: "string", description: "Candidate/lead id" },
        },
        required: ["job_id", "candidate_id"],
      },
    },
    {
      name: "get_talent_graph",
      description:
        "Tenant skills graph: top skills, placed skills, by job title. Optional rebuild.",
      input_schema: {
        type: "object",
        properties: {
          rebuild: {
            type: "string",
            description: "true to force rebuild of the skills snapshot",
          },
        },
        required: [],
      },
    },
    {
      name: "list_sequences",
      description: "List outreach sequences for this tenant.",
      input_schema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "enroll_in_sequence",
      description:
        "Enroll a candidate in an outreach sequence. Preview first, then confirmed:true.",
      input_schema: {
        type: "object",
        properties: {
          sequence_id: { type: "string", description: "Sequence id" },
          candidate_id: { type: "string", description: "Candidate id" },
          job_id: { type: "string", description: "Optional job id" },
          confirmed: {
            type: "string",
            description: "true after user confirms",
          },
        },
        required: ["sequence_id", "candidate_id"],
      },
    },
    {
      name: "draft_outreach",
      description:
        "Generate personalized outreach subject/body for a candidate. Does not send.",
      input_schema: {
        type: "object",
        properties: {
          candidate_id: { type: "string", description: "Candidate id" },
          job_id: { type: "string", description: "Optional job id" },
          sequence_id: { type: "string", description: "Optional sequence id" },
        },
        required: ["candidate_id"],
      },
    },
    {
      name: "fill_req_playbook",
      description:
        "Fill this req playbook: rank candidates by fit, drafts, next actions. Does not auto-mutate CRM.",
      input_schema: {
        type: "object",
        properties: {
          job_id: { type: "string", description: "Job id" },
          max_candidates: {
            type: "number",
            description: "Max ranked candidates (default 10)",
          },
          sequence_id: {
            type: "string",
            description: "Optional sequence for draft templates",
          },
        },
        required: ["job_id"],
      },
    },
    {
      name: "set_job_prescreen_questions",
      description:
        "Set careers pre-screen questions on a job. Preview first, then confirmed:true.",
      input_schema: {
        type: "object",
        properties: {
          job_id: { type: "string", description: "Job id" },
          questions: {
            type: "string",
            description: "Array of prompts or question objects; [] to clear",
          },
          confirmed: {
            type: "string",
            description: "true after user confirms",
          },
        },
        required: ["job_id", "questions"],
      },
    },
  ];
  return filterEnabledToolSchemas(all);
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

  // Direct website / URL examination
  const websiteKeywords = [
    "website", "web site", "homepage", "home page", "about page",
    "look at the site", "check the site", "browse", "examine the",
    "visit the", "read the site", "from their site", "company site",
    "their website", "the website", "http://", "https://", ".com",
    ".io", ".co", ".org", ".net", "www.",
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
  
  if (isApolloToolEnabled() && (hasCompanyKeywords || hasLocationKeywords)) {
    tools.push(APOLLO_COMPANY_TOOL_NAME);
  }
  
  // Add people search tool (recruiting)
  if (isApolloToolEnabled() && candidateKeywords.some(kw => q.includes(kw))) {
    tools.push(APOLLO_TOOL_NAME);
  }

  // Direct website fetch when a URL or site is mentioned
  if (
    websiteKeywords.some((kw) => q.includes(kw)) ||
    /https?:\/\//i.test(query) ||
    /\b[a-z0-9-]+\.(com|io|co|org|net|ai|us)\b/i.test(query)
  ) {
    tools.push(FETCH_WEBSITE_TOOL_NAME);
  }
  
  // Add web search (general queries)
  if (isTavilyToolEnabled() && searchKeywords.some(kw => q.includes(kw))) {
    tools.push(TAVILY_TOOL_NAME);
  }
  
  // Add internal data (if checking own data)
  if (internalKeywords.some(kw => q.includes(kw))) {
    tools.push(INTERNAL_TOOL_NAME);
  }
  
  return filterEnabledToolNames(tools);
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

  // Direct website fetch
  if (results.fetch_website?.success && results.fetch_website.data) {
    hasData = true;
    const data = results.fetch_website.data as {
      url?: string;
      finalUrl?: string;
      title?: string;
      text?: string;
      truncated?: boolean;
    };
    parts.push(
      formatFetchWebsiteResult({
        url: data.url || "",
        finalUrl: data.finalUrl || data.url || "",
        title: data.title || "",
        text: data.text || "",
        truncated: !!data.truncated,
      })
    );
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
  fetch_website: {
    name: FETCH_WEBSITE_TOOL_NAME,
    description: FETCH_WEBSITE_TOOL_DESCRIPTION,
    execute: executeFetchWebsite,
  },
  internal_data: {
    name: INTERNAL_TOOL_NAME,
    description: INTERNAL_TOOL_DESCRIPTION,
    execute: executeInternalData,
  },
};
