/**
 * Internal Data Tool
 * 
 * Access tenant's own data (leads, clients, pipeline).
 * Uses repositories for proper tenant isolation.
 * 
 * @serverOnly
 */

import { ToolResult, ToolContext, ToolParams } from "./types";

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
 * Internal data result
 */
export interface InternalData {
  leads?: unknown[];
  clients?: unknown[];
  pipeline?: unknown[];
}

/**
 * Execute internal data access
 * 
 * @param params - Data access parameters
 * @param context - Tool execution context (MUST include tenantId)
 * @returns ToolResult with data or error
 */
export async function executeInternalData(
  params: ToolParams,
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
  
  try {
    const baseUrl = context.requestUrl || 
      process.env.NEXT_PUBLIC_APP_URL || 
      "http://localhost:3001";
    
    // Build endpoint
    let endpoint = "";
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
    }
    
    // Make API call with tenant ID in headers (set by middleware)
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "GET",
      headers: new Headers({
        "Content-Type": "application/json",
        "x-tenant-id": context.tenantId,
      }),
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
      metadata: { 
        source: "internal", 
        tenantId: context.tenantId,
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
