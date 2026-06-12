/**
 * AWS Reporting - DynamoDB Queries
 * 
 * Direct DynamoDB queries for the Reporting dashboard.
 * Provides pipeline stats, candidates over time, sources, and events.
 * 
 * @serverOnly
 */

import { getSessionTenantId } from '../server-auth';
import { queryItems, leadsTable, eventsTable, scanItems } from '../db/dynamodb';

// ============================================================================
// Types
// ============================================================================

export interface StageCount {
  stage: string;
  count: number;
  label: string;
}

export interface TimeSeriesData {
  date: string;
  count: number;
}

export interface SourceData {
  source: string;
  count: number;
  label: string;
}

export interface EventData {
  id: string;
  candidateId: string;
  eventType: string;
  title: string;
  description?: string;
  createdAt: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export interface PipelineStats {
  byStage: StageCount[];
  total: number;
}

export interface CandidatesOverTimeData {
  period: TimeSeriesData[];
}

export interface SourceStats {
  bySource: SourceData[];
  total: number;
}

export interface EventStats {
  events: EventData[];
  total: number;
}

export interface ReportingStats {
  // KPIs
  totalCandidates: number;
  inPipeline: number;
  hiredThisMonth: number;
  avgTimeToHire: number;
  
  // Detailed data
  pipeline: PipelineStats;
  candidatesOverTime: CandidatesOverTimeData;
  sources: SourceStats;
  recentEvents: EventStats;
  
  // UI metadata
  periodLabel: string;
  lastUpdated: string;
}

// Pipeline stage order and labels
const STAGE_ORDER = [
  { key: 'identification', label: 'Identification' },
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'interested', label: 'Interested' },
  { key: 'outreach', label: 'Outreach' },
  { key: 'conversation', label: 'Conversation' },
  { key: 'presented', label: 'Presented' },
  { key: 'interview', label: 'Interview' },
  { key: 'accept', label: 'Offer Extended' },
  { key: 'converted', label: 'Hired' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'not_interested', label: 'Not Interested' },
];

// ============================================================================
// Helper Functions
// ============================================================================

function getStageLabel(stage: string): string {
  const found = STAGE_ORDER.find(s => s.key === stage);
  return found?.label ?? stage.charAt(0).toUpperCase() + stage.slice(1);
}

function getDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

function groupByField<T extends Record<string, unknown>>(
  items: T[],
  field: keyof T
): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const value = String(item[field] ?? 'unknown');
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return map;
}

function calculateAvgTimeToHire(hiredItems: Array<{ created_at?: string; modified_at?: string }>): number {
  if (hiredItems.length === 0) return 0;
  
  let totalDays = 0;
  let count = 0;
  
  for (const item of hiredItems) {
    if (item.created_at && item.modified_at) {
      const created = new Date(item.created_at);
      const modified = new Date(item.modified_at);
      const days = Math.floor((modified.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      if (days > 0) {
        totalDays += days;
        count++;
      }
    }
  }
  
  return count > 0 ? Math.round(totalDays / count) : 0;
}

// ============================================================================
// Core Data Functions
// ============================================================================

/**
 * Get pipeline stats - candidates grouped by stage
 */
export async function getPipelineStats(tenantId: string): Promise<PipelineStats> {
  try {
    const records = await queryItems<{ status: string }>(
      leadsTable,
      'tenant_id = :tenantId',
      { ':tenantId': tenantId }
    );

    const stageMap = groupByField(records, 'status');
    
    // Order by STAGE_ORDER
    const byStage: StageCount[] = STAGE_ORDER
      .filter(stage => stageMap.has(stage.key))
      .map(stage => ({
        stage: stage.key,
        label: stage.label,
        count: stageMap.get(stage.key) ?? 0,
      }));

    // Add any unknown stages
    for (const [stage, count] of stageMap) {
      if (!STAGE_ORDER.find(s => s.key === stage)) {
        byStage.push({
          stage,
          label: getStageLabel(stage),
          count,
        });
      }
    }

    return {
      byStage,
      total: records.length,
    };
  } catch (error) {
    console.error('[REPORTING] Pipeline stats error:', error);
    return { byStage: [], total: 0 };
  }
}

/**
 * Get candidates added over time (last 30 days)
 */
export async function getCandidatesOverTime(
  tenantId: string,
  period: 'week' | 'month' | 'quarter' = 'month'
): Promise<CandidatesOverTimeData> {
  const days = period === 'week' ? 7 : period === 'month' ? 30 : 90;
  const startDate = getDaysAgo(days);

  try {
    const records = await queryItems<{ created_at: string }>(
      leadsTable,
      'tenant_id = :tenantId',
      { ':tenantId': tenantId }
    );

    // Filter to date range
    const filtered = records.filter(r => r.created_at && r.created_at >= startDate);
    
    // Group by date
    const dateMap = new Map<string, number>();
    for (const record of filtered) {
      if (record.created_at) {
        const date = record.created_at.split('T')[0];
        dateMap.set(date, (dateMap.get(date) ?? 0) + 1);
      }
    }

    // Create time series
    const period: TimeSeriesData[] = [];
    const current = new Date(startDate);
    const now = new Date();
    
    while (current <= now) {
      const dateStr = current.toISOString().split('T')[0];
      period.push({
        date: dateStr,
        count: dateMap.get(dateStr) ?? 0,
      });
      current.setDate(current.getDate() + 1);
    }

    return { period };
  } catch (error) {
    console.error('[REPORTING] Candidates over time error:', error);
    return { period: [] };
  }
}

/**
 * Get source breakdown
 */
export async function getSourceStats(tenantId: string): Promise<SourceStats> {
  try {
    const records = await queryItems<{ source: string }>(
      leadsTable,
      'tenant_id = :tenantId',
      { ':tenantId': tenantId }
    );

    const sourceMap = groupByField(records, 'source');
    
    const bySource: SourceData[] = [];
    for (const [source, count] of sourceMap) {
      if (source && source !== 'unknown' && source !== '') {
        bySource.push({
          source,
          label: source.charAt(0).toUpperCase() + source.slice(1),
          count,
        });
      }
    }

    // Sort by count descending
    bySource.sort((a, b) => b.count - a.count);

    // Add "Other" for empty/unknown
    const otherCount = (sourceMap.get('') ?? 0) + (sourceMap.get('unknown') ?? 0);
    if (otherCount > 0) {
      bySource.push({
        source: 'other',
        label: 'Other',
        count: otherCount,
      });
    }

    return {
      bySource,
      total: records.length,
    };
  } catch (error) {
    console.error('[REPORTING] Source stats error:', error);
    return { bySource: [], total: 0 };
  }
}

/**
 * Get recent events (last 20)
 */
export async function getRecentEvents(tenantId: string): Promise<EventStats> {
  try {
    // Query all events for tenant - we need to filter by tenant
    // Events are stored with PK = CANDIDATE#{candidateId}, can't directly query by tenant
    // So we'll get all candidates first, then get their events
    
    const candidates = await queryItems<{ id: string }>(
      leadsTable,
      'tenant_id = :tenantId',
      { ':tenantId': tenantId }
    );

    const allEvents: EventData[] = [];
    
    // Get events for each candidate (limit to avoid too many queries)
    const candidateIds = candidates.slice(0, 50).map(c => c.id);
    
    for (const candidateId of candidateIds) {
      try {
        const events = await queryItems<{
          SK: string;
          candidateId: string;
          eventType: string;
          title: string;
          description?: string;
          createdAt: string;
          createdBy: string;
          metadata?: Record<string, unknown>;
        }>(
          eventsTable,
          'PK = :pk AND begins_with(SK, :skPrefix)',
          {
            ':pk': `CANDIDATE#${candidateId}`,
            ':skPrefix': 'EVENT#',
          }
        );

        for (const event of events) {
          allEvents.push({
            id: event.SK.replace('EVENT#', ''),
            candidateId: event.candidateId,
            eventType: event.eventType,
            title: event.title,
            description: event.description,
            createdAt: event.createdAt,
            createdBy: event.createdBy,
            metadata: event.metadata,
          });
        }
      } catch {
        // Skip errors for individual candidates
      }
    }

    // Sort by date descending
    allEvents.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    
    // Take last 20
    const events = allEvents.slice(0, 20);

    return {
      events,
      total: allEvents.length,
    };
  } catch (error) {
    console.error('[REPORTING] Recent events error:', error);
    return { events: [], total: 0 };
  }
}

/**
 * Get all reporting stats for the dashboard
 */
export async function getReportingStats(): Promise<ReportingStats> {
  const tenantId = await getSessionTenantId();
  
  if (!tenantId) {
    return getEmptyStats();
  }

  try {
    // Fetch all data in parallel
    const [pipeline, candidatesOverTime, sources, events] = await Promise.all([
      getPipelineStats(tenantId),
      getCandidatesOverTime(tenantId, 'month'),
      getSourceStats(tenantId),
      getRecentEvents(tenantId),
    ]);

    // Calculate KPIs
    const inPipeline = pipeline.byStage
      .filter(s => !['rejected', 'not_interested', 'converted'].includes(s.stage))
      .reduce((sum, s) => sum + s.count, 0);
    
    const hiredThisMonth = pipeline.byStage
      .find(s => s.stage === 'converted')?.count ?? 0;

    // Get all leads to calculate avg time
    const allLeads = await queryItems<{ created_at?: string; modified_at?: string }>(
      leadsTable,
      'tenant_id = :tenantId',
      { ':tenantId': tenantId }
    );

    const avgTimeToHire = calculateAvgTimeToHire(allLeads);

    return {
      totalCandidates: pipeline.total,
      inPipeline,
      hiredThisMonth,
      avgTimeToHire,
      pipeline,
      candidatesOverTime,
      sources,
      recentEvents: events,
      periodLabel: 'Last 30 days',
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[REPORTING] Get reporting stats error:', error);
    return getEmptyStats();
  }
}

function getEmptyStats(): ReportingStats {
  return {
    totalCandidates: 0,
    inPipeline: 0,
    hiredThisMonth: 0,
    avgTimeToHire: 0,
    pipeline: { byStage: [], total: 0 },
    candidatesOverTime: { period: [] },
    sources: { bySource: [], total: 0 },
    recentEvents: { events: [], total: 0 },
    periodLabel: 'Last 30 days',
    lastUpdated: new Date().toISOString(),
  };
}

// ============================================================================
// Legacy exports for backward compatibility
// ============================================================================

export async function generateDashboardEmbedUrl(options: {
  dashboardId: string;
  tenantId?: string;
  filters?: Array<{
    column: string;
    values: string[];
    operator: string;
  }>;
}) {
  console.log('[REPORTING] generateDashboardEmbedUrl called but QuickSight is disabled');
  return null;
}

export async function getReportingData() {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    return {
      pipeline: { byStage: [], total: 0 },
      candidates: { total: 0, byStatus: [] },
      aiUsage: {
        day: { totalTokens: 0, estimatedCost: 0, totalInvocations: 0 },
        week: { totalTokens: 0, estimatedCost: 0, totalInvocations: 0 },
        month: { totalTokens: 0, estimatedCost: 0, totalInvocations: 0 },
      },
    };
  }

  const pipeline = await getPipelineStats(tenantId);
  
  return {
    pipeline: {
      byStage: pipeline.byStage.map(s => ({ stage: s.stage, count: s.count })),
      total: pipeline.total,
    },
    candidates: { total: pipeline.total, byStatus: [] },
    aiUsage: {
      day: { totalTokens: 0, estimatedCost: 0, totalInvocations: 0 },
      week: { totalTokens: 0, estimatedCost: 0, totalInvocations: 0 },
      month: { totalTokens: 0, estimatedCost: 0, totalInvocations: 0 },
    },
  };
}

/**
 * Check if QuickSight is configured
 * Currently always returns false (QuickSight is disabled)
 */
export function isQuickSightConfigured(): boolean {
  return false;
}
