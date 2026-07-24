/**
 * Bedrock Usage Analytics
 * 
 * Real-time usage tracking via DynamoDB for instant dashboard numbers
 * Athena queries for deep analytics (when logging is set up in AWS Console)
 * 
 * @serverOnly
 */

import {
  getSession,
  getSessionTenantId,
  getSessionUserId,
  getSessionUserEmail,
} from '../server-auth';
import {
  queryItems,
  putItem,
  scanItems,
  bedrockUsageTable,
} from '../db/dynamodb';

// ============================================================================
// Constants - Claude Pricing (per 1K tokens)
// ============================================================================

export const CLAUDE_PRICING = {
  // Haiku 4.5 (list-builder default + fallbacks)
  'us.anthropic.claude-haiku-4-2025-01-15': {
    input: 0.00025,
    output: 0.00125,
  },
  'global.anthropic.claude-haiku-4-5-20251001-v1:0': {
    input: 0.00025,
    output: 0.00125,
  },
  'us.anthropic.claude-haiku-4-5-20251001-v1:0': {
    input: 0.00025,
    output: 0.00125,
  },
  'us.anthropic.claude-3-haiku-20240307-v1:0': {
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
  // Amazon Nova (approx on-demand $/1K tokens — confirm in Bedrock pricing)
  'us.amazon.nova-2-lite-v1:0': { input: 0.00006, output: 0.00024 },
  'amazon.nova-2-lite-v1:0': { input: 0.00006, output: 0.00024 },
  'us.amazon.nova-lite-v1:0': { input: 0.00006, output: 0.00024 },
  'amazon.nova-lite-v1:0': { input: 0.00006, output: 0.00024 },
  'us.amazon.nova-pro-v1:0': { input: 0.0008, output: 0.0032 },
  'amazon.nova-pro-v1:0': { input: 0.0008, output: 0.0032 },
} as Record<string, { input: number; output: number }>;

// Default pricing for unknown models
const DEFAULT_PRICING = { input: 0.003, output: 0.015 };
const HAIKU_PRICING = { input: 0.00025, output: 0.00125 };
const NOVA_LITE_PRICING = { input: 0.00006, output: 0.00024 };

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
  if (CLAUDE_PRICING[modelId]) return CLAUDE_PRICING[modelId];
  // Strip provider: prefix from multi-provider logs (e.g. bedrock:us.anthropic...)
  const bare = modelId.includes(':')
    ? modelId.split(':').slice(1).join(':')
    : modelId;
  if (CLAUDE_PRICING[bare]) return CLAUDE_PRICING[bare];
  const lower = modelId.toLowerCase();
  if (lower.includes('haiku')) return HAIKU_PRICING;
  if (lower.includes('nova-lite') || lower.includes('nova-2-lite')) {
    return NOVA_LITE_PRICING;
  }
  if (lower.includes('nova-pro')) {
    return CLAUDE_PRICING['us.amazon.nova-pro-v1:0'] || DEFAULT_PRICING;
  }
  if (lower.includes('nova')) return NOVA_LITE_PRICING;
  return DEFAULT_PRICING;
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
// Tenant resolution
// ============================================================================

/**
 * Resolve which tenant IDs to query for the usage dashboard.
 * Primary = session tenant; also includes common fallbacks so logs under
 * "default" still surface when session tenant is missing/mismatched.
 */
export async function resolveUsageTenantIds(
  explicit?: string | null
): Promise<{ primary: string; all: string[] }> {
  const session = await getSession().catch(() => null);
  const fromSession = session?.tenantId || (await getSessionTenantId());
  const primary =
    (explicit && explicit.trim()) ||
    (fromSession && fromSession.trim()) ||
    'tenant-2024-001';

  const all = Array.from(
    new Set(
      [primary, fromSession, 'tenant-2024-001', 'default', 'SYSTEM'].filter(
        (t): t is string => !!t && t.trim().length > 0
      )
    )
  );

  return { primary, all };
}

async function fetchUsageRecords(
  tenantIds: string[],
  start: string,
  end: string
): Promise<BedrockUsageRecord[]> {
  const results: BedrockUsageRecord[] = [];
  const seen = new Set<string>();

  for (const tenantId of tenantIds) {
    try {
      const { items } = await queryItems<BedrockUsageRecord>(
        bedrockUsageTable,
        'PK = :pk AND SK BETWEEN :start AND :end',
        {
          ':pk': `TENANT#${tenantId}`,
          ':start': `USAGE#${start}`,
          ':end': `USAGE#${end}~`,
        }
      );
      for (const item of items) {
        const key = `${item.PK}|${item.SK}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push(item);
        }
      }
    } catch (err) {
      console.error('[USAGE] query failed for', tenantId, err);
    }
  }

  // If still empty, scan table (small usage tables only)
  if (results.length === 0) {
    try {
      const scanned = await scanItems<BedrockUsageRecord>(bedrockUsageTable);
      const startMs = new Date(start).getTime();
      const endMs = new Date(end).getTime() + 86_400_000;
      for (const item of scanned) {
        const ts = new Date(item.timestamp || item.SK || 0).getTime();
        if (!Number.isFinite(ts) || (ts >= startMs && ts <= endMs)) {
          const key = `${item.PK}|${item.SK}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push(item);
          }
        }
      }
    } catch (err) {
      console.error('[USAGE] scan fallback failed', err);
    }
  }

  return results;
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
  /** Optional overrides when session is missing (e.g. from request headers) */
  tenantId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  provider?: string;
}): Promise<{ ok: boolean; tenantId?: string; error?: string }> {
  try {
    const session = await getSession().catch(() => null);
    const tenantId =
      (params.tenantId && params.tenantId.trim()) ||
      session?.tenantId ||
      (await getSessionTenantId()) ||
      'tenant-2024-001';
    const userId =
      (params.userId && params.userId.trim()) ||
      session?.userId ||
      (await getSessionUserId()) ||
      'anonymous';
    const userEmail =
      params.userEmail ||
      session?.email ||
      (await getSessionUserEmail()) ||
      'anonymous';

    const timestamp = new Date().toISOString();
    // Unique SK so concurrent calls don't overwrite each other
    const unique =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);
    const estimatedCost = calculateCost(
      params.modelId,
      params.inputTokens,
      params.outputTokens
    );

    const record: BedrockUsageRecord = {
      PK: `TENANT#${tenantId}`,
      SK: `USAGE#${timestamp}#${unique}`,
      tenantId,
      userId,
      userEmail,
      modelId: params.modelId,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      totalTokens: params.inputTokens + params.outputTokens,
      estimatedCost,
      queryPreview: (params.queryPreview || '').substring(0, 200),
      toolsUsed: params.toolsUsed || [],
      latencyMs: params.latencyMs || 0,
      timestamp,
    };

    await putItem(bedrockUsageTable, record);
    console.log(
      '[USAGE] Logged OK:',
      `tenant=${tenantId}`,
      params.provider || 'bedrock',
      params.modelId,
      params.inputTokens,
      params.outputTokens,
      `$${estimatedCost.toFixed(4)}`
    );
    return { ok: true, tenantId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[USAGE] Failed to log:', message, error);
    return { ok: false, error: message };
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
}): Promise<{ ok: boolean; tenantId?: string; error?: string }> {
  // Reuse main logger so Apollo rows share the same SK scheme (USAGE#iso#id)
  // and land in the same dashboard date queries.
  const session = await getSession().catch(() => null);
  return logBedrockUsage({
    modelId: params.modelId || 'apollo-search',
    inputTokens: 0,
    outputTokens: Math.max(1, (params.resultsCount || 0) * 100),
    queryPreview: params.queryPreview || '',
    toolsUsed: ['apollo'],
    latencyMs: 0,
    tenantId:
      params.tenantId ||
      session?.tenantId ||
      (await getSessionTenantId()) ||
      'tenant-2024-001',
    userId:
      params.userId ||
      session?.userId ||
      (await getSessionUserId()) ||
      'apollo',
    userEmail:
      params.userEmail ||
      session?.email ||
      (await getSessionUserEmail()) ||
      'apollo@system',
    provider: 'apollo',
  });
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
  const { start, end } = getDateRange(period);
  const { all: tenantIds } = await resolveUsageTenantIds();

  try {
    const records = await fetchUsageRecords(tenantIds, start, end);

    let totalInvocations = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let estimatedCost = 0;

    for (const record of records) {
      totalInvocations++;
      totalInputTokens += record.inputTokens || 0;
      totalOutputTokens += record.outputTokens || 0;
      estimatedCost += record.estimatedCost || 0;
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
  const { start, end } = getDateRange(period);
  const { all: tenantIds } = await resolveUsageTenantIds();

  try {
    const records = await fetchUsageRecords(tenantIds, start, end);

    // Group by user
    const byUserMap = new Map<string, UsageByUser>();

    for (const record of records) {
      const existing = byUserMap.get(record.userId);

      if (existing) {
        existing.invocations++;
        existing.totalTokens += record.totalTokens || 0;
        existing.estimatedCost += record.estimatedCost || 0;
      } else {
        byUserMap.set(record.userId, {
          userId: record.userId,
          userEmail: record.userEmail,
          invocations: 1,
          totalTokens: record.totalTokens || 0,
          estimatedCost: record.estimatedCost || 0,
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
  const { start, end } = getDateRange(period);
  const { all: tenantIds } = await resolveUsageTenantIds();

  try {
    const records = await fetchUsageRecords(tenantIds, start, end);

    // Group by model
    const byModelMap = new Map<string, UsageByModel>();

    for (const record of records) {
      const existing = byModelMap.get(record.modelId);

      if (existing) {
        existing.invocations++;
        existing.totalTokens += record.totalTokens || 0;
        existing.estimatedCost += record.estimatedCost || 0;
      } else {
        byModelMap.set(record.modelId, {
          modelId: record.modelId,
          invocations: 1,
          totalTokens: record.totalTokens || 0,
          estimatedCost: record.estimatedCost || 0,
        });
      }
    }

    return Array.from(byModelMap.values()).sort(
      (a, b) => b.invocations - a.invocations
    );
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
  const { start, end } = getDateRange(period);
  const { all: tenantIds } = await resolveUsageTenantIds();

  try {
    const records = await fetchUsageRecords(tenantIds, start, end);

    // Sort by timestamp descending and take limit
    const sorted = records
      .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
      .slice(0, limit);

    return sorted.map((record, idx) => ({
      id: `${record.SK}-${idx}`,
      timestamp: record.timestamp,
      modelId: record.modelId,
      inputTokens: record.inputTokens || 0,
      outputTokens: record.outputTokens || 0,
      estimatedCost: record.estimatedCost || 0,
      userId: record.userId,
      userEmail: record.userEmail,
      queryPreview: record.queryPreview,
    }));
  } catch (error) {
    console.error('[USAGE] getRecentCalls error:', error);
    return [];
  }
}

/** Diagnostic for Usage dashboard */
export async function getUsageDiagnostics(): Promise<{
  primaryTenant: string;
  tenantsQueried: string[];
  table: string;
  totalItemsScanned: number;
  sessionPresent: boolean;
}> {
  const session = await getSession().catch(() => null);
  const { primary, all } = await resolveUsageTenantIds();
  let totalItemsScanned = 0;
  try {
    const allItems = await scanItems<BedrockUsageRecord>(bedrockUsageTable);
    totalItemsScanned = allItems.length;
  } catch {
    totalItemsScanned = -1;
  }
  return {
    primaryTenant: primary,
    tenantsQueried: all,
    table: bedrockUsageTable,
    totalItemsScanned,
    sessionPresent: !!session?.userId,
  };
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
