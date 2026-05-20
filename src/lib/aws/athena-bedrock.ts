/**
 * Bedrock Usage Analytics
 * 
 * Real-time usage tracking via DynamoDB for instant dashboard numbers
 * Athena queries for deep analytics (when logging is set up in AWS Console)
 * 
 * @serverOnly
 */

import { getSessionTenantId, getSessionUserId, getSessionUserEmail } from '../server-auth';
import { queryItems, putItem, bedrockUsageTable } from '../db/dynamodb';

// ============================================================================
// Constants - Claude Pricing (per 1K tokens)
// ============================================================================

export const CLAUDE_PRICING = {
  // Haiku 4.5
  'us.anthropic.claude-haiku-4-2025-01-15': {
    input: 0.00025,
    output: 0.00125,
  },
  // Sonnet 4.6
  'global.anthropic.claude-sonnet-4-6': {
    input: 0.003,
    output: 0.015,
  },
  'us.anthropic.claude-sonnet-4-6-20250219': {
    input: 0.003,
    output: 0.015,
  },
  // Opus 4.7
  'us.anthropic.claude-opus-4-7-2025-01-15': {
    input: 0.015,
    output: 0.075,
  },
} as Record<string, { input: number; output: number }>;

// Default pricing for unknown models
const DEFAULT_PRICING = { input: 0.003, output: 0.015 };

// ============================================================================
// Types
// ============================================================================

export interface BedrockUsageRecord {
  PK: string;
  SK: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  queryPreview: string;
  toolsUsed: string[];
  latencyMs: number;
  timestamp: string;
}

export interface UsageSummary {
  totalInvocations: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  period: 'day' | 'week' | 'month';
  startDate: string;
  endDate: string;
}

export interface UsageByUser {
  userId: string;
  userEmail: string;
  invocations: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface UsageByModel {
  modelId: string;
  invocations: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface UsageDetail {
  id: string;
  timestamp: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  userId?: string;
  userEmail?: string;
  queryPreview: string;
}

export interface FullUsageReport {
  summary: UsageSummary;
  byUser: UsageByUser[];
  byModel: UsageByModel[];
  recentCalls: UsageDetail[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get date range for period
 */
function getDateRange(period: 'day' | 'week' | 'month'): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  
  switch (period) {
    case 'day':
      start.setDate(start.getDate() - 1);
      break;
    case 'week':
      start.setDate(start.getDate() - 7);
      break;
    case 'month':
      start.setMonth(start.getMonth() - 1);
      break;
  }
  
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

/**
 * Get pricing for a model
 */
function getModelPricing(modelId: string): { input: number; output: number } {
  return CLAUDE_PRICING[modelId] || DEFAULT_PRICING;
}

/**
 * Calculate cost from tokens
 */
function calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const pricing = getModelPricing(modelId);
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  return inputCost + outputCost;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Log a Bedrock API call to DynamoDB for real-time dashboard
 * Called from the Bedrock route after each API call
 * 
 * @param params - Usage data to log
 */
export async function logBedrockUsage(params: {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  queryPreview: string;
  toolsUsed: string[];
  latencyMs: number;
}): Promise<void> {
  try {
    const tenantId = await getSessionTenantId();
    const userId = await getSessionUserId();
    const userEmail = await getSessionUserEmail() || 'anonymous';
    
    if (!tenantId || !userId) {
      console.log('[USAGE] Skipping log - no session');
      return;
    }
    
    const timestamp = new Date().toISOString();
    const estimatedCost = calculateCost(params.modelId, params.inputTokens, params.outputTokens);
    
    const record: BedrockUsageRecord = {
      PK: `TENANT#${tenantId}`,
      SK: `USAGE#${timestamp}`,
      tenantId,
      userId,
      userEmail,
      modelId: params.modelId,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      totalTokens: params.inputTokens + params.outputTokens,
      estimatedCost,
      queryPreview: params.queryPreview.substring(0, 200),
      toolsUsed: params.toolsUsed,
      latencyMs: params.latencyMs,
      timestamp,
    };
    
    await putItem(bedrockUsageTable, record);
    console.log('[USAGE] Logged:', params.modelId, params.inputTokens, params.outputTokens);
  } catch (error) {
console.error('[USAGE] Failed to log:', error);
  }
}

/**
 * Log Apollo API usage
 * Logs user/tenant context when available, falls back to system for unauthenticated
 * 
 * @param params - Apollo usage data
 */
export async function logApolloUsage(params: {
  modelId: string;
  resultsCount: number;
  estimatedCost: number;
  queryPreview: string;
  tenantId?: string;
  userId?: string;
  userEmail?: string;
}): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    
    // Use actual tenant/user if provided, otherwise system
    const tenant = params.tenantId || 'SYSTEM';
    const user = params.userId || 'apollo';
    const email = params.userEmail || 'apollo@system';
    
    const record: BedrockUsageRecord = {
      PK: `TENANT#${tenant}`,
      SK: `USAGE#APOLLO#${timestamp}`,
      tenantId: tenant,
      userId: user,
      userEmail: email,
      modelId: params.modelId,
      inputTokens: 0,
      outputTokens: params.resultsCount * 100, // Estimate tokens from results
      totalTokens: params.resultsCount * 100,
      estimatedCost: params.estimatedCost,
      queryPreview: params.queryPreview.substring(0, 200),
      toolsUsed: ['apollo'],
      latencyMs: 0,
      timestamp,
    };
    
    await putItem(bedrockUsageTable, record);
    console.log('[APOLLO] Logged:', params.modelId, params.resultsCount, params.estimatedCost, 'tenant:', tenant);
  } catch (error) {
    console.error('[APOLLO] Failed to log:', error);
  }
}

/**
 * Get Bedrock usage summary for a period
 * 
 * @param period - Time period: 'day', 'week', or 'month'
 * @returns Usage summary with tokens, cost, and counts
 */
export async function getBedrockUsageSummary(
  period: 'day' | 'week' | 'month' = 'week'
): Promise<UsageSummary> {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    return {
      totalInvocations: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
      period,
      startDate: '',
      endDate: '',
    };
  }
  
  const { start, end } = getDateRange(period);
  
  try {
    const records = await queryItems<BedrockUsageRecord>(
      bedrockUsageTable,
      'PK = :pk AND SK BETWEEN :start AND :end',
      {
        ':pk': `TENANT#${tenantId}`,
        ':start': `USAGE#${start}`,
        ':end': `USAGE#${end}`,
      }
    );
    
    let totalInvocations = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let estimatedCost = 0;
    
    for (const record of records) {
      totalInvocations++;
      totalInputTokens += record.inputTokens;
      totalOutputTokens += record.outputTokens;
      estimatedCost += record.estimatedCost;
    }
    
    return {
      totalInvocations,
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      estimatedCost,
      period,
      startDate: start,
      endDate: end,
    };
  } catch (error) {
    console.error('[USAGE] getBedrockUsageSummary error:', error);
    return {
      totalInvocations: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
      period,
      startDate: start,
      endDate: end,
    };
  }
}

/**
 * Get usage breakdown by user
 * 
 * @param period - Time period
 * @param limit - Max results
 * @returns Array of usage by user
 */
export async function getUsageByUser(
  period: 'day' | 'week' | 'month' = 'week',
  limit: number = 10
): Promise<UsageByUser[]> {
  const tenantId = await getSessionTenantId();
  if (!tenantId) return [];
  
  const { start, end } = getDateRange(period);
  
  try {
    const records = await queryItems<BedrockUsageRecord>(
      bedrockUsageTable,
      'PK = :pk AND SK BETWEEN :start AND :end',
      {
        ':pk': `TENANT#${tenantId}`,
        ':start': `USAGE#${start}`,
        ':end': `USAGE#${end}`,
      }
    );
    
    // Group by user
    const byUserMap = new Map<string, UsageByUser>();
    
    for (const record of records) {
      const existing = byUserMap.get(record.userId);
      
      if (existing) {
        existing.invocations++;
        existing.totalTokens += record.totalTokens;
        existing.estimatedCost += record.estimatedCost;
      } else {
        byUserMap.set(record.userId, {
          userId: record.userId,
          userEmail: record.userEmail,
          invocations: 1,
          totalTokens: record.totalTokens,
          estimatedCost: record.estimatedCost,
        });
      }
    }
    
    // Convert to array and sort
    return Array.from(byUserMap.values())
      .sort((a, b) => b.invocations - a.invocations)
      .slice(0, limit);
  } catch (error) {
    console.error('[USAGE] getUsageByUser error:', error);
    return [];
  }
}

/**
 * Get usage breakdown by model
 * 
 * @param period - Time period
 * @returns Array of usage by model
 */
export async function getUsageByModel(
  period: 'day' | 'week' | 'month' = 'week'
): Promise<UsageByModel[]> {
  const tenantId = await getSessionTenantId();
  if (!tenantId) return [];
  
  const { start, end } = getDateRange(period);
  
  try {
    const records = await queryItems<BedrockUsageRecord>(
      bedrockUsageTable,
      'PK = :pk AND SK BETWEEN :start AND :end',
      {
        ':pk': `TENANT#${tenantId}`,
        ':start': `USAGE#${start}`,
        ':end': `USAGE#${end}`,
      }
    );
    
    // Group by model
    const byModelMap = new Map<string, UsageByModel>();
    
    for (const record of records) {
      const existing = byModelMap.get(record.modelId);
      
      if (existing) {
        existing.invocations++;
        existing.totalTokens += record.totalTokens;
        existing.estimatedCost += record.estimatedCost;
      } else {
        byModelMap.set(record.modelId, {
          modelId: record.modelId,
          invocations: 1,
          totalTokens: record.totalTokens,
          estimatedCost: record.estimatedCost,
        });
      }
    }
    
    return Array.from(byModelMap.values()).sort((a, b) => b.invocations - a.invocations);
  } catch (error) {
    console.error('[USAGE] getUsageByModel error:', error);
    return [];
  }
}

/**
 * Get recent calls
 * 
 * @param period - Time period
 * @param limit - Max results
 * @returns Array of recent calls
 */
export async function getRecentCalls(
  period: 'day' | 'week' | 'month' = 'day',
  limit: number = 20
): Promise<UsageDetail[]> {
  const tenantId = await getSessionTenantId();
  if (!tenantId) return [];
  
  const { start, end } = getDateRange(period);
  
  try {
    const records = await queryItems<BedrockUsageRecord>(
      bedrockUsageTable,
      'PK = :pk AND SK BETWEEN :start AND :end',
      {
        ':pk': `TENANT#${tenantId}`,
        ':start': `USAGE#${start}`,
        ':end': `USAGE#${end}`,
      }
    );
    
    // Sort by timestamp descending and take limit
    const sorted = records
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
    
    return sorted.map((record, idx) => ({
      id: `${record.SK}-${idx}`,
      timestamp: record.timestamp,
      modelId: record.modelId,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      estimatedCost: record.estimatedCost,
      userId: record.userId,
      userEmail: record.userEmail,
      queryPreview: record.queryPreview,
    }));
  } catch (error) {
    console.error('[USAGE] getRecentCalls error:', error);
    return [];
  }
}

/**
 * Get full usage report
 * 
 * @param period - Time period
 * @returns Full usage report
 */
export async function getFullUsageReport(
  period: 'day' | 'week' | 'month' = 'week'
): Promise<FullUsageReport> {
  const [summary, byUser, byModel, recentCalls] = await Promise.all([
    getBedrockUsageSummary(period),
    getUsageByUser(period),
    getUsageByModel(period),
    getRecentCalls(period),
  ]);
  
  return {
    summary,
    byUser,
    byModel,
    recentCalls,
  };
}
