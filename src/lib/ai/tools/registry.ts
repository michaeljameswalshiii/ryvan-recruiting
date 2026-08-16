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
import {
  executeApolloLookup,
  APOLLO_LOOKUP_TOOL_NAME,
  APOLLO_LOOKUP_TOOL_DESCRIPTION,
} from "./apollo-lookup";
import { executeTavilySearch, TAVILY_TOOL_NAME, TAVILY_TOOL_DESCRIPTION } from "./tavily";
import {
  executeFetchWebsite,
  FETCH_WEBSITE_TOOL_NAME,
  FETCH_WEBSITE_TOOL_DESCRIPTION,
} from "./fetch-website";
import { executeInternalData, INTERNAL_TOOL_NAME, INTERNAL_TOOL_DESCRIPTION } from "./internal";
import {
  executeGenerateFile,
  GENERATE_FILE_TOOL_NAME,
  GENERATE_FILE_TOOL_DESCRIPTION,
} from "./generate-file";
import { CRM_WRITE_TOOLS } from "./crm-write";
import { FIT_GRAPH_TOOLS } from "./fit-and-graph-tools";
import { SEQUENCE_TOOLS } from "./sequence-tools";
import { PLAYBOOK_TOOLS } from "./playbook-tools";
import { SCREEN_TOOLS } from "./screen-tools";
import {
  executeGeneratePresentation,
  executeGenerateImage,
  GENERATE_PRESENTATION_TOOL_NAME,
  GENERATE_PRESENTATION_TOOL_DESCRIPTION,
  GENERATE_IMAGE_TOOL_NAME,
  GENERATE_IMAGE_TOOL_DESCRIPTION,
} from "./visual";
import { LIST_BUILDER_TOOLS } from "./list-builder-tools";
import {
  executeAgentCoreWebSearch,
  AGENTCORE_WEB_SEARCH_TOOL_NAME,
  AGENTCORE_WEB_SEARCH_TOOL_DESCRIPTION,
} from "./agentcore-web-search";
import {
  executeSourceCandidates,
  SOURCE_CANDIDATES_TOOL_NAME,
  SOURCE_CANDIDATES_TOOL_DESCRIPTION,
} from "./source-candidates";
import { recordToolAudit } from "@/lib/db/repositories/tool-audit-repository";
import {
  disabledExternalToolMessage,
  isExternalToolDisabled,
} from "@/lib/ai/tool-flags";
import {
  logToolTenant,
  prepareToolExecution,
} from "@/lib/ai/tenant-scope";

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

  TOOL_REGISTRY[APOLLO_LOOKUP_TOOL_NAME] = {
    name: APOLLO_LOOKUP_TOOL_NAME,
    description: APOLLO_LOOKUP_TOOL_DESCRIPTION,
    execute: executeApolloLookup,
  };
  
  // Tavily search tool
  TOOL_REGISTRY[TAVILY_TOOL_NAME] = {
    name: TAVILY_TOOL_NAME,
    description: TAVILY_TOOL_DESCRIPTION,
    execute: executeTavilySearch,
  };

  // Amazon Bedrock AgentCore Web Search (public web / resume research)
  TOOL_REGISTRY[AGENTCORE_WEB_SEARCH_TOOL_NAME] = {
    name: AGENTCORE_WEB_SEARCH_TOOL_NAME,
    description: AGENTCORE_WEB_SEARCH_TOOL_DESCRIPTION,
    execute: executeAgentCoreWebSearch,
  };

  // Source people to fill a job (careers URL / brief → Apollo/PDL)
  TOOL_REGISTRY[SOURCE_CANDIDATES_TOOL_NAME] = {
    name: SOURCE_CANDIDATES_TOOL_NAME,
    description: SOURCE_CANDIDATES_TOOL_DESCRIPTION,
    execute: executeSourceCandidates,
  };

  // Direct website fetch (no third-party API key)
  TOOL_REGISTRY[FETCH_WEBSITE_TOOL_NAME] = {
    name: FETCH_WEBSITE_TOOL_NAME,
    description: FETCH_WEBSITE_TOOL_DESCRIPTION,
    execute: executeFetchWebsite,
  };
  
  // Internal data tool
  TOOL_REGISTRY[INTERNAL_TOOL_NAME] = {
    name: INTERNAL_TOOL_NAME,
    description: INTERNAL_TOOL_DESCRIPTION,
    execute: executeInternalData,
  };

  // Generate downloadable files (docx, xlsx, csv, md, …)
  TOOL_REGISTRY[GENERATE_FILE_TOOL_NAME] = {
    name: GENERATE_FILE_TOOL_NAME,
    description: GENERATE_FILE_TOOL_DESCRIPTION,
    execute: executeGenerateFile,
  };

  TOOL_REGISTRY[GENERATE_PRESENTATION_TOOL_NAME] = {
    name: GENERATE_PRESENTATION_TOOL_NAME,
    description: GENERATE_PRESENTATION_TOOL_DESCRIPTION,
    execute: executeGeneratePresentation,
  };
  TOOL_REGISTRY[GENERATE_IMAGE_TOOL_NAME] = {
    name: GENERATE_IMAGE_TOOL_NAME,
    description: GENERATE_IMAGE_TOOL_DESCRIPTION,
    execute: executeGenerateImage,
  };

  // CRM write tools (create/update candidate, company, job, stages, link)
  for (const t of CRM_WRITE_TOOLS) {
    TOOL_REGISTRY[t.name] = {
      name: t.name,
      description: t.description,
      execute: t.execute as ToolDefinition["execute"],
    };
  }

  // Fit score + tenant skills graph
  for (const t of FIT_GRAPH_TOOLS) {
    TOOL_REGISTRY[t.name] = {
      name: t.name,
      description: t.description,
      execute: t.execute,
    };
  }

  // Outreach sequences
  for (const t of SEQUENCE_TOOLS) {
    TOOL_REGISTRY[t.name] = {
      name: t.name,
      description: t.description,
      execute: t.execute as ToolDefinition["execute"],
    };
  }

  // BD list builder (background company/contact research jobs)
  for (const t of LIST_BUILDER_TOOLS) {
    TOOL_REGISTRY[t.name] = {
      name: t.name,
      description: t.description,
      execute: t.execute as ToolDefinition["execute"],
    };
  }

  // Playbooks (Fill this req)
  for (const t of PLAYBOOK_TOOLS) {
    TOOL_REGISTRY[t.name] = {
      name: t.name,
      description: t.description,
      execute: t.execute as ToolDefinition["execute"],
    };
  }

  // Careers pre-screen questions
  for (const t of SCREEN_TOOLS) {
    TOOL_REGISTRY[t.name] = {
      name: t.name,
      description: t.description,
      execute: t.execute as ToolDefinition["execute"],
    };
  }
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
 * Fire-and-forget audit — never throws into the tool path
 */
function auditSafe(
  toolName: string,
  context: ToolContext,
  params: ToolParams,
  start: number,
  result: { success: boolean; error?: string; resultStatus?: string }
): void {
  try {
    void recordToolAudit({
      tenantId: context.tenantId || "unknown",
      userId: context.userId,
      toolName,
      success: result.success,
      error: result.error,
      durationMs: Date.now() - start,
      params,
      resultStatus: result.resultStatus,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/**
 * Execute tool by name (timed + audited)
 */
export async function executeTool(
  toolName: string,
  params: ToolParams,
  context: ToolContext
): Promise<ToolResult> {
  const start = Date.now();
  const tool = TOOL_REGISTRY[toolName];

  // Tenant lock + strip model-supplied tenant_id before anything runs
  const prepared = prepareToolExecution(toolName, params || ({} as ToolParams), context);
  const safeParams = prepared.params;
  const safeContext = prepared.context;
  logToolTenant(toolName, safeContext, {
    strippedTenantArgs: true,
  });

  if (prepared.rejectError) {
    const result: ToolResult = {
      success: false,
      error: prepared.rejectError,
      metadata: { reason: "no_tenant", tenantIsolation: true },
    };
    auditSafe(toolName, safeContext, safeParams, start, {
      success: false,
      error: result.error,
      resultStatus: "no_tenant",
    });
    return result;
  }

  if (!tool) {
    const result: ToolResult = {
      success: false,
      error: `Tool not found: ${toolName}`,
    };
    auditSafe(toolName, safeContext, safeParams, start, {
      success: false,
      error: result.error,
      resultStatus: "not_found",
    });
    return result;
  }

  // Apollo / Tavily: code kept, disabled in assistant until env re-enable
  if (isExternalToolDisabled(toolName)) {
    const result: ToolResult = {
      success: false,
      error: disabledExternalToolMessage(toolName),
    };
    auditSafe(toolName, safeContext, safeParams, start, {
      success: false,
      error: result.error,
      resultStatus: "disabled",
    });
    return result;
  }

  try {
    // Agent Desk: one-time user approval auto-confirms CRM write tools
    let execParams = safeParams;
    if (safeContext.agentWriteApproved) {
      const writeTools = new Set([
        "create_company_with_primary_contact",
        "create_company",
        "update_company",
        "create_contact",
        "update_contact",
        "create_candidate",
        "update_candidate",
        "create_job",
        "update_job",
        "link_candidate_to_job",
        "update_candidate_stage",
        "update_job_candidate_stage",
      ]);
      if (writeTools.has(toolName)) {
        execParams = { ...safeParams, confirmed: true };
      }
    }
    const result = await tool.execute(execParams, safeContext);
    // Never echo a different tenant back from tools
    if (result?.metadata && typeof result.metadata === "object") {
      (result.metadata as Record<string, unknown>).tenantId =
        safeContext.tenantId;
    }
    const status =
      result?.success === false
        ? "error"
        : String(
            (result?.data as { status?: string } | undefined)?.status || "ok"
          );
    auditSafe(toolName, safeContext, safeParams, start, {
      success: !!result?.success,
      error: result?.error,
      resultStatus: status,
    });
    return result;
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Tool execution failed";
    auditSafe(toolName, safeContext, safeParams, start, {
      success: false,
      error: errorMessage,
      resultStatus: "exception",
    });
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
  apolloLookup: APOLLO_LOOKUP_TOOL_NAME,
  apolloCompany: APOLLO_COMPANY_TOOL_NAME,
  tavily: TAVILY_TOOL_NAME,
  webSearch: AGENTCORE_WEB_SEARCH_TOOL_NAME,
  fetchWebsite: FETCH_WEBSITE_TOOL_NAME,
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
