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

// ============================================================================
// Types
// ============================================================================

/**
 * Internal data types
 */
export type InternalDataType = "leads" | "clients" | "pipeline";

/**
 * Internal data actions
 */
export type InternalDataAction = "list" | "get";

/**
 * Tool metadata
 */
export const INTERNAL_TOOL_NAME = "internal_data";
export const INTERNAL_TOOL_DESCRIPTION = 
  "Access your organization's internal data (leads, clients, pipeline). Requires tenant authentication.";

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
  
  // Validate data type
  const validTypes: InternalDataType[] = ["leads", "clients", "pipeline"];
  if (!input.data_type || !validTypes.includes(input.data_type)) {
    return {
      success: false,
      error: `Invalid data type. Must be one of: ${validTypes.join(", ")}`,
    };
  }
  
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
    
    switch (input.data_type) {
      case "leads":
        if (input.action === "list") {
          data = await getAllLeads(tenantId);
        } else {
          data = await getLeadById(tenantId, input.id!);
        }
        break;
        
      case "clients":
        if (input.action === "list") {
          data = await getAllClients(tenantId);
        } else {
          data = await getClientById(tenantId, input.id!);
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
