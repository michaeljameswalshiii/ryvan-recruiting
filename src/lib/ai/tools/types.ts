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
export interface ToolContext {
  tenantId: string | null;
  userId: string | null;
  requestUrl?: string;
  /** Populated by generate_file tool; returned on the HTTP response for UI downloads */
  generatedFiles?: Array<{
    fileName: string;
    mimeType: string;
    contentBase64: string;
    sizeBytes: number;
    format: string;
  }>;
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
