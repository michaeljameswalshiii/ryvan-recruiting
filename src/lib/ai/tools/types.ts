/**
 * AI Tools - Shared Types
 * 
 * TypeScript interfaces for tool system.
 * 
 * @serverOnly
 */

/**
 * Tool execution parameters
 */
export interface ToolParams {
  query: string;
  [key: string]: unknown;
}

/**
 * Execution context passed to all tools
 */
export interface ToolSpendEntry {
  tool: string;
  estimatedCostUsd: number;
  queries?: number;
  label?: string;
}

export interface ToolContext {
  /**
   * Effective tenant for all CRM/internal tools.
   * ALWAYS set from session (or site-admin act-as header) — never from the model.
   */
  tenantId: string | null;
  userId: string | null;
  email?: string | null;
  /** Canonical role: site_admin | company_admin | user */
  role?: string | null;
  isSiteAdmin?: boolean;
  /** Login session tenant (before any admin act-as) */
  sessionTenantId?: string | null;
  /** When site admin uses X-Act-As-Tenant-Id */
  actAsTenantId?: string | null;
  requestUrl?: string;
  /** Populated by generate_file tool; returned on the HTTP response for UI downloads */
  generatedFiles?: Array<{
    fileName: string;
    mimeType: string;
    contentBase64: string;
    sizeBytes: number;
    format: string;
  }>;
  /**
   * Accumulated third-party / AgentCore tool spend for this agent turn.
   * Surfaced on the AI response as estimatedToolCostUsd + toolSpend.
   */
  toolSpend?: ToolSpendEntry[];
  /**
   * Agent Desk: user approved CRM writes for this run once.
   * Write tools may skip the preview gate (confirmed:true injected).
   */
  agentWriteApproved?: boolean;
  /** Soft cap for bulk creates in one agent wave (default 10) */
  agentMaxCreatesPerWave?: number;
}

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
export interface ToolDefinition {
  name: string;
  description: string;
  execute: (params: ToolParams, context: ToolContext) => Promise<ToolResult>;
}

/**
 * Rate limit info
 */
export interface RateLimitInfo {
  allowed: boolean;
  remaining: number;
  resetAt?: number;
}

/**
 * Token usage info
 */
export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

/**
 * Structured response metadata
 */
export interface ResponseMetadata {
  latencyMs: number;
  tokens?: TokenUsage;
  tenantId?: string;
  toolsUsed: string[];
}
