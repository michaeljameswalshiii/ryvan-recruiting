/**
 * Internal Data Tool
 * 
 * Access tenant's own data (leads, clients, pipeline).
 * Uses repositories directly for proper tenant isolation.
 * 
 * @serverOnly
 */

import { ToolResult, ToolContext } from "./types";
import { getAllLeads, getLeadById } from "../../db/repositories/lead-repository";
import { getAllClients, getClientById } from "../../db/repositories/client-repository";
import { getAllPipeline, getPipelineById } from "../../db/repositories/pipeline-repository";
import { getAllJobs, getJobById } from "../../db/repositories/job-repository";

// ============================================================================
// Types
// ============================================================================

/**
 * Internal data types
 */
export type InternalDataType = "leads" | "clients" | "pipeline" | "jobs" | "candidates";

/**
 * Internal data actions
 */
export type InternalDataAction = "list" | "get";

/**
 * Tool metadata
 */
export const INTERNAL_TOOL_NAME = "internal_data";
export const INTERNAL_TOOL_DESCRIPTION =
  "Read your organization's ATS data: leads/candidates, clients/companies, jobs, pipeline. " +
  "Use list or get (with id). Requires sign-in. Read-only — use create_* / update_* tools to change data.";

/**
 * Internal data input parameters
 */
export interface InternalDataParams {
  data_type: InternalDataType;
  action: InternalDataAction;
  id?: string;
}

/**
 * Execute internal data access
 * 
 * @param params - Data access parameters
 * @param context - Tool execution context (MUST include tenantId)
 * @returns ToolResult with data or error
 */
export async function executeInternalData(
  params: unknown,
  context: ToolContext
): Promise<ToolResult> {
  // Parse input
  const input = params as InternalDataParams;
  
  // ENFORCE TENANT ISOLATION - Never allow without tenantId
  if (!context.tenantId) {
    return {
      success: false,
      error: "Tenant context required for internal data access",
      metadata: { reason: "no_tenant" }
    };
  }
  
  // Validate data type (candidates is alias for leads)
  const validTypes: InternalDataType[] = [
    "leads",
    "candidates",
    "clients",
    "pipeline",
    "jobs",
  ];
  if (!input.data_type || !validTypes.includes(input.data_type)) {
    return {
      success: false,
      error: `Invalid data type. Must be one of: ${validTypes.join(", ")}`,
    };
  }
  const dataType =
    input.data_type === "candidates" ? "leads" : input.data_type;
  
  // Validate action
  const validActions: InternalDataAction[] = ["list", "get"];
  if (!input.action || !validActions.includes(input.action)) {
    return {
      success: false,
      error: `Invalid action. Must be one of: ${validActions.join(", ")}`,
    };
  }
  
  // If getting by ID, require ID
  if (input.action === "get" && !input.id) {
    return {
      success: false,
      error: "ID required for get action",
    };
  }
  
  try {
    const tenantId = context.tenantId;
    let data: unknown;
    
    switch (dataType) {
      case "leads":
        if (input.action === "list") {
          const leads = await getAllLeads(tenantId);
          // Compact list for model context
          data = Array.isArray(leads)
            ? leads.slice(0, 80).map((l) => ({
                id: l.id,
                name: l.name,
                email: l.email,
                title: l.title,
                status: l.status,
                phone: l.phone,
                location: l.location,
              }))
            : [];
        } else {
          data = await getLeadById(tenantId, input.id!);
        }
        break;
        
      case "clients":
        if (input.action === "list") {
          const clients = await getAllClients(tenantId);
          data = Array.isArray(clients)
            ? clients.slice(0, 80).map((c) => ({
                id: c.id,
                name: c.name,
                industry: c.industry,
                city: c.city,
                state: c.state,
                status: c.status,
              }))
            : [];
        } else {
          data = await getClientById(tenantId, input.id!);
        }
        break;

      case "jobs":
        if (input.action === "list") {
          const jobs = await getAllJobs(tenantId);
          data = Array.isArray(jobs)
            ? jobs.slice(0, 80).map((j) => ({
                id: j.id,
                title: j.title,
                companyId: j.companyId,
                companyName: j.companyName,
                status: j.status,
                location: j.location,
                candidateCount: j.candidates?.length || 0,
              }))
            : [];
        } else {
          data = await getJobById(tenantId, input.id!);
        }
        break;
        
      case "pipeline":
        if (input.action === "list") {
          data = await getAllPipeline(tenantId);
        } else {
          data = await getPipelineById(tenantId, input.id!);
        }
        break;
    }
    
    return { 
      success: true, 
      data,
      metadata: { 
        source: "internal", 
        tenantId,
        dataType: input.data_type,
        action: input.action 
      }
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
