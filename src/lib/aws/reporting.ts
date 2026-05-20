/**
 * AWS QuickSight Reporting
 * 
 * Server-side functions for QuickSight dashboard embedding.
 * Falls back gracefully when QuickSight is not configured.
 * 
 * Note: Full QuickSight embedding requires manual setup via AWS console.
 * See AWS_QUICKSIGHT_REPORTING_SETUP.md for instructions.
 * 
 * @serverOnly
 */

import { getSessionTenantId } from '../server-auth';
import { queryItems, pipelineTable, leadsTable } from '../db/dynamodb';
import { getBedrockUsageSummary } from './athena-bedrock';

// ============================================================================
// Configuration
// ============================================================================

const quicksightRegion = process.env.AWS_QUICKSIGHT_REGION || process.env.AWS_REGION || 'us-east-1';
const accountId = process.env.AWS_QUICKSIGHT_ACCOUNT_ID || process.env.AWS_ACCOUNT_ID;
const embedRoleArn = process.env.AWS_QUICKSIGHT_EMBED_ROLE_ARN;
const namespace = process.env.AWS_QUICKSIGHT_NAMESPACE || 'default';

// ============================================================================
// Types
// ============================================================================

export interface EmbedUrlOptions {
  dashboardId: string;
  tenantId?: string;
  userId?: string;
  filters?: EmbedFilter[];
  resetDisabled?: boolean;
  sidebarCollapsed?: boolean;
}

export interface EmbedFilter {
  column: string;
  values: string[];
  operator: 'EQUALS' | 'CONTAINS' | 'STARTSWITH' | 'ENDSWITH';
}

export interface EmbedUrlResult {
  embedUrl?: string;
  expiration: string;
  dashboardId: string;
}

export interface DashboardInfo {
  dashboardId: string;
  name: string;
  description?: string;
}

export interface ReportingData {
  pipeline: { byStage: Array<{ stage: string; count: number }>; total: number };
  candidates: { total: number; byStatus: Array<{ status: string; count: number }> };
  aiUsage: {
    day: { totalTokens: number; estimatedCost: number; totalInvocations: number };
    week: { totalTokens: number; estimatedCost: number; totalInvocations: number };
    month: { totalTokens: number; estimatedCost: number; totalInvocations: number };
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

export function isQuickSightConfigured(): boolean {
  return !!(accountId && embedRoleArn);
}

function isValidDashboardId(id: string): boolean {
  return /^[a-zA-Z0-9-]+$/.test(id);
}

function getExpiration(): string {
  const expires = new Date();
  expires.setMinutes(expires.getMinutes() + 10);
  return expires.toISOString();
}

async function getQuickSightClient(): Promise<any> {
  try {
    const { QuickSightClient } = await import('@aws-sdk/client-quicksight');
    return new QuickSightClient({ region: quicksightRegion });
  } catch {
    return null;
  }
}

// ============================================================================
// Core Functions
// ============================================================================

export async function generateDashboardEmbedUrl(
  options: EmbedUrlOptions
): Promise<EmbedUrlResult | null> {
  const { dashboardId } = options;

  if (!isQuickSightConfigured()) {
    console.log('[REPORTING] QuickSight not configured');
    return null;
  }

  if (!isValidDashboardId(dashboardId)) {
    console.log('[REPORTING] Invalid dashboard ID:', dashboardId);
    return null;
  }

  try {
    const client = await getQuickSightClient();
    if (!client) {
      console.log('[REPORTING] QuickSight client unavailable');
      return null;
    }

    const pkg = await import('@aws-sdk/client-quicksight');
    const GenerateEmbedUrlCommand = (pkg as any).GenerateEmbedUrlCommand;
    
    if (!GenerateEmbedUrlCommand) {
      console.log('[REPORTING] GenerateEmbedUrlCommand not in SDK');
      return null;
    }

    const params: any = {
      AwsAccountId: accountId,
      DashboardId: dashboardId,
      IdentityType: 'IAM_IDENTITY',
      SessionLifetimeInMinutes: 60,
      EmbedRoleArn: embedRoleArn,
      Namespace: namespace,
    };

    console.log('[REPORTING] Generating embed URL for dashboard:', dashboardId);
    
    const command = new GenerateEmbedUrlCommand(params);
    const response: any = await client.send(command);

    const embedUrlRaw = response.EmbedUrl;
    const embedUrl = embedUrlRaw != null ? String(embedUrlRaw) : '';
    
    if (!embedUrl) {
      console.log('[REPORTING] No embed URL in response');
      return null;
    }

return {
      embedUrl: embedUrl || undefined,
      expiration: getExpiration(),
      dashboardId,
    };
  } catch (error: any) {
    console.error('[REPORTING] Generate embed URL error:', error.message);
    return null;
  }
}

export async function generateSecureEmbedUrl(
  dashboardId: string,
  tenantId?: string
): Promise<EmbedUrlResult | null> {
  let resolvedTenantId: string | undefined = tenantId;
  
  if (!resolvedTenantId) {
    const sessionTenantId = await getSessionTenantId();
    // Handle null from getSessionTenantId()
    if (sessionTenantId != null) {
      resolvedTenantId = sessionTenantId as string;
    }
  }

  if (!resolvedTenantId) {
    console.log('[REPORTING] No tenant ID');
    return null;
  }

  const filters: EmbedFilter[] = [
    { column: 'tenant_id', values: [resolvedTenantId], operator: 'EQUALS' },
  ];

  return generateDashboardEmbedUrl({ dashboardId, tenantId: resolvedTenantId, filters });
}

export async function listDashboards(): Promise<DashboardInfo[]> {
  if (!isQuickSightConfigured()) {
    return [];
  }

  try {
    const client = await getQuickSightClient();
    if (!client) return [];

    const { ListDashboardsCommand } = await import('@aws-sdk/client-quicksight');
    const command = new ListDashboardsCommand({
      AwsAccountId: accountId,
      MaxResults: 100,
    });
    const response: any = await client.send(command);

    const list = response.DashboardSummaryList;
    if (!list) return [];

    return list.map((d: any) => ({
      dashboardId: String(d.DashboardId ?? ''),
      name: String(d.Name ?? ''),
      description: String(d.Description ?? ''),
    }));
  } catch (error: any) {
    console.error('[REPORTING] List dashboards error:', error.message);
    return [];
  }
}

// ============================================================================
// Report Data Helpers (for fallback charts)
// ============================================================================

export async function getPipelineSummary(): Promise<{ byStage: Array<{ stage: string; count: number }>; total: number }> {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) return { byStage: [], total: 0 };

    const records = await queryItems(
      pipelineTable,
      'tenant_id = :tenantId',
      { ':tenantId': tenantId }
    );

    const stageMap = new Map<string, number>();
    for (const record of records as any[]) {
      const stage = String((record as any).stage ?? 'new');
      stageMap.set(stage, (stageMap.get(stage) ?? 0) + 1);
    }

    return {
      byStage: Array.from(stageMap.entries()).map(([stage, count]) => ({ stage, count })),
      total: records.length,
    };
  } catch (error: any) {
    console.error('[REPORTING] Pipeline summary error:', error.message);
    return { byStage: [], total: 0 };
  }
}

export async function getCandidateSummary(): Promise<{ total: number; byStatus: Array<{ status: string; count: number }> }> {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) return { total: 0, byStatus: [] };

    const records = await queryItems(
      leadsTable,
      'tenant_id = :tenantId',
      { ':tenantId': tenantId }
    );

    const statusMap = new Map<string, number>();
    for (const record of records as any[]) {
      const status = String((record as any).status ?? 'new');
      statusMap.set(status, (statusMap.get(status) ?? 0) + 1);
    }

    return {
      total: records.length,
      byStatus: Array.from(statusMap.entries()).map(([status, count]) => ({ status, count })),
    };
  } catch (error: any) {
    console.error('[REPORTING] Candidate summary error:', error.message);
    return { total: 0, byStatus: [] };
  }
}

export async function getAiUsageSummary() {
  try {
    const [day, week, month] = await Promise.all([
      getBedrockUsageSummary('day'),
      getBedrockUsageSummary('week'),
      getBedrockUsageSummary('month'),
    ]);
    return { day, week, month };
  } catch (error: any) {
    console.error('[REPORTING] AI usage summary error:', error.message);
    return {
      day: { totalTokens: 0, estimatedCost: 0, totalInvocations: 0 },
      week: { totalTokens: 0, estimatedCost: 0, totalInvocations: 0 },
      month: { totalTokens: 0, estimatedCost: 0, totalInvocations: 0 },
    };
  }
}

export async function getReportingData(): Promise<ReportingData> {
  const [pipeline, candidates, aiUsage] = await Promise.all([
    getPipelineSummary(),
    getCandidateSummary(),
    getAiUsageSummary(),
  ]);
  return { pipeline, candidates, aiUsage };
}
