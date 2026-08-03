/**
 * Reporting analytics — DynamoDB aggregations for the Reporting dashboard.
 * Covers candidates, jobs, companies, sources, aging, and period comparisons.
 *
 * @serverOnly
 */

import { getSessionTenantId } from '../server-auth';
import { queryItems, leadsTable, eventsTable } from '../db/dynamodb';
import { getAllClients } from '../db/repositories/client-repository';
import { getAllJobs } from '../db/repositories/job-repository';

// ============================================================================
// Types
// ============================================================================

export type PeriodKey = '7' | '30' | '90' | 'ytd';

export interface StageCount {
  stage: string;
  count: number;
  label: string;
}

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  conversionFromPrev: number | null; // % from previous step (null for first)
  shareOfTotal: number; // % of total candidates
}

export interface TimeSeriesData {
  date: string;
  count: number;
}

export interface SourceQuality {
  source: string;
  label: string;
  count: number;
  interviewing: number;
  placed: number;
  interviewRate: number;
  placementRate: number;
}

export interface EventData {
  id: string;
  candidateId: string;
  eventType: string;
  title: string;
  description?: string;
  createdAt: string;
  createdBy: string;
  href?: string;
}

export interface AttentionItem {
  id: string;
  type: 'candidate' | 'job' | 'company';
  title: string;
  subtitle: string;
  reason: string;
  days: number;
  href: string;
  severity: 'high' | 'medium' | 'low';
}

export interface JobHealth {
  open: number;
  onHold: number;
  closed: number;
  emptyOpen: number;
  withCandidates: number;
  avgCandidatesPerOpen: number;
  topJobs: Array<{
    id: string;
    title: string;
    companyName: string;
    status: string;
    candidateCount: number;
    daysOpen: number;
  }>;
}

export interface CompanyHealth {
  total: number;
  byStage: StageCount[];
  noContacts: number;
  noOpenJobs: number;
  closedWon: number;
  lost: number;
}

export interface KpiDelta {
  value: number;
  previous: number;
  deltaPct: number | null; // null if previous is 0
  label: string;
}

export interface ReportingStats {
  // KPIs
  totalCandidates: number;
  placements: number;
  openJobs: number;
  inMotion: number;
  avgTimeToHire: number;
  avgTimeToFill: number;

  placementsKpi: KpiDelta;
  candidatesAddedKpi: KpiDelta;
  openJobsKpi: KpiDelta;

  // Funnel (5-step application model)
  funnel: FunnelStep[];
  pipelineByStage: StageCount[];

  // Time series
  candidatesOverTime: TimeSeriesData[];
  previousCandidatesOverTime: TimeSeriesData[];
  companiesOverTime: TimeSeriesData[];

  // Sources with quality
  sources: SourceQuality[];

  // Jobs / companies
  jobs: JobHealth;
  companies: CompanyHealth;

  // Attention + activity
  needsAttention: AttentionItem[];
  recentEvents: EventData[];
  insights: string[];

  // Meta
  periodDays: number;
  periodLabel: string;
  previousPeriodLabel: string;
  lastUpdated: string;
}

// Funnel aligned with candidate pipeline UI
const FUNNEL_STEPS = [
  {
    key: 'sourced',
    label: 'Sourced',
    match: [
      'sourced',
      'left_message',
      'text',
      'email',
      'other',
      'contacted',
      'identification',
      'outreach',
      'new',
      'identified',
    ],
  },
  {
    key: 'applied',
    label: 'Applied',
    match: ['applied', 'application'],
  },
  {
    key: 'interested',
    label: 'Interested',
    match: ['interested'],
  },
  {
    key: 'submitted',
    label: 'Submitted',
    match: ['pre_screened', 'submitted', 'presented', 'conversation', 'qualified'],
  },
  {
    key: 'interviewing',
    label: 'Interviewing',
    match: ['interviewing', 'interview'],
  },
  {
    key: 'offer_out',
    label: 'Offer Out',
    match: ['offer_out', 'offer_accepted', 'offer', 'accept'],
  },
  {
    key: 'placed',
    label: 'Placed',
    match: ['placed', 'converted', 'hired'],
  },
] as const;

const COMPANY_STAGE_ORDER = [
  { key: 'identification', label: 'Identification' },
  { key: 'outreach', label: 'Outreach' },
  { key: 'conversation', label: 'Conversation' },
  { key: 'meeting', label: 'Meeting' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'closed_won', label: 'Closed Won' },
  { key: 'client', label: 'Client' },
  { key: 'known_user', label: 'Known User' },
  { key: 'dnu', label: 'DNU' },
  { key: 'lost', label: 'Lost' },
];

const TERMINAL_STAGES = new Set([
  'rejected',
  'not_interested',
  'offer_declined',
  'placed',
  'converted',
  'hired',
  'withdrawn',
]);

// ============================================================================
// Helpers
// ============================================================================

function unwrapItems<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && Array.isArray((result as any).items)) {
    return (result as any).items as T[];
  }
  return [];
}

function periodDays(key: PeriodKey): number {
  if (key === '7') return 7;
  if (key === '90') return 90;
  if (key === 'ytd') {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    return Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 86400000));
  }
  return 30;
}

function periodLabel(key: PeriodKey): string {
  if (key === '7') return 'Last 7 days';
  if (key === '90') return 'Last 90 days';
  if (key === 'ytd') return 'Year to date';
  return 'Last 30 days';
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / 86400000);
}

function ageDays(value?: string | null, now = new Date()): number {
  const d = parseDate(value);
  if (!d) return 0;
  return daysBetween(d, now);
}

function inRange(iso: string | undefined, start: Date, end: Date): boolean {
  const d = parseDate(iso);
  if (!d) return false;
  return d >= start && d <= end;
}

function normalizeCandidateStage(raw?: string): string {
  if (!raw) return 'sourced';
  return String(raw).trim().toLowerCase().replace(/\s+/g, '_');
}

function getPrimaryStage(candidate: any): string {
  const linked = Array.isArray(candidate.linkedJobs) ? candidate.linkedJobs : [];
  if (linked.length > 0 && linked[0]?.stage) {
    return normalizeCandidateStage(linked[0].stage);
  }
  return normalizeCandidateStage(candidate.status || candidate.stage || 'sourced');
}

function funnelIndex(stage: string): number {
  const s = stage.toLowerCase();
  if (['rejected', 'not_interested', 'offer_declined', 'withdrawn'].includes(s)) {
    return -1;
  }
  for (let i = FUNNEL_STEPS.length - 1; i >= 0; i--) {
    if (FUNNEL_STEPS[i].match.includes(s) || FUNNEL_STEPS[i].key === s) {
      return i;
    }
  }
  return 0;
}

function isPlaced(stage: string): boolean {
  return ['placed', 'converted', 'hired'].includes(stage.toLowerCase());
}

function isInterviewingOrBeyond(stage: string): boolean {
  const idx = funnelIndex(stage);
  return idx >= 2; // interviewing, offer, placed
}

function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function sourceLabel(source: string): string {
  if (!source || source === 'unknown') return 'Other';
  return source.charAt(0).toUpperCase() + source.slice(1).replace(/_/g, ' ');
}

function buildTimeSeries(
  items: Array<{ created_at?: string; createdAt?: string }>,
  start: Date,
  end: Date
): TimeSeriesData[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const raw = item.created_at || item.createdAt;
    if (!raw || !inRange(raw, start, end)) continue;
    const key = raw.split('T')[0];
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  const series: TimeSeriesData[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);

  while (cursor <= endDay) {
    const key = cursor.toISOString().split('T')[0];
    series.push({ date: key, count: map.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return series;
}

function calculateAvgDays(
  items: Array<{ start?: string; end?: string }>
): number {
  let total = 0;
  let n = 0;
  for (const item of items) {
    const a = parseDate(item.start);
    const b = parseDate(item.end);
    if (!a || !b) continue;
    const days = daysBetween(a, b);
    if (days >= 0 && days < 3650) {
      total += days;
      n++;
    }
  }
  return n > 0 ? Math.round(total / n) : 0;
}

// ============================================================================
// Main aggregator
// ============================================================================

export async function getReportingStats(
  period: PeriodKey = '30'
): Promise<ReportingStats> {
  const tenantId = await getSessionTenantId();
  if (!tenantId) return getEmptyStats(period);

  const days = periodDays(period);
  const now = new Date();
  const periodStart = new Date(now.getTime() - days * 86400000);
  const prevStart = new Date(periodStart.getTime() - days * 86400000);
  const prevEnd = new Date(periodStart.getTime() - 1);

  try {
    const [leadsRaw, jobs, companies] = await Promise.all([
      queryItems<any>(leadsTable, 'tenant_id = :tenantId', {
        ':tenantId': tenantId,
      }),
      getAllJobs(tenantId).catch(() => [] as any[]),
      getAllClients(tenantId).catch(() => [] as any[]),
    ]);

    const leads = unwrapItems<any>(leadsRaw);
    const safeJobs = Array.isArray(jobs) ? jobs : [];
    const safeCompanies = Array.isArray(companies) ? companies : [];

    // Enrich candidates
    const candidates = leads.map((c) => {
      const stage = getPrimaryStage(c);
      const created = c.created_at || c.createdAt;
      const modified = c.modified_at || c.modifiedAt || c.updated_at || created;
      return {
        raw: c,
        id: c.id,
        name: c.name || 'Unknown',
        stage,
        source: (c.source || 'Manual').toString(),
        created,
        modified,
        funnelIdx: funnelIndex(stage),
      };
    });

    // Period cohorts
    const addedThisPeriod = candidates.filter((c) =>
      inRange(c.created, periodStart, now)
    );
    const addedPrevPeriod = candidates.filter((c) =>
      inRange(c.created, prevStart, prevEnd)
    );

    const placedThisPeriod = candidates.filter(
      (c) => isPlaced(c.stage) && inRange(c.modified, periodStart, now)
    );
    const placedPrevPeriod = candidates.filter(
      (c) => isPlaced(c.stage) && inRange(c.modified, prevStart, prevEnd)
    );

    const inMotion = candidates.filter((c) => {
      if (TERMINAL_STAGES.has(c.stage)) return false;
      return c.funnelIdx >= 0;
    }).length;

    // Funnel: cumulative "reached at least this step"
    // Count candidates whose funnel index >= step
    const totalForFunnel = candidates.filter((c) => c.funnelIdx >= 0).length || 1;
    const funnel: FunnelStep[] = FUNNEL_STEPS.map((step, i) => {
      const count = candidates.filter((c) => c.funnelIdx >= i).length;
      const prevCount =
        i === 0
          ? null
          : candidates.filter((c) => c.funnelIdx >= i - 1).length;
      const conversionFromPrev =
        prevCount === null || prevCount === 0
          ? null
          : Math.round((count / prevCount) * 1000) / 10;
      return {
        key: step.key,
        label: step.label,
        count,
        conversionFromPrev,
        shareOfTotal: Math.round((count / totalForFunnel) * 1000) / 10,
      };
    });

    // Stage distribution (raw)
    const stageMap = new Map<string, number>();
    for (const c of candidates) {
      stageMap.set(c.stage, (stageMap.get(c.stage) ?? 0) + 1);
    }
    const pipelineByStage: StageCount[] = Array.from(stageMap.entries())
      .map(([stage, count]) => ({
        stage,
        count,
        label: stage.replace(/_/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase()),
      }))
      .sort((a, b) => b.count - a.count);

    // Time series
    const candidatesOverTime = buildTimeSeries(
      candidates.map((c) => ({ created_at: c.created })),
      periodStart,
      now
    );
    const previousCandidatesOverTime = buildTimeSeries(
      candidates.map((c) => ({ created_at: c.created })),
      prevStart,
      prevEnd
    );
    const companiesOverTime = buildTimeSeries(
      safeCompanies.map((co) => ({
        created_at: co.created_at || co.createdAt,
      })),
      periodStart,
      now
    );

    // Source quality
    const sourceMap = new Map<
      string,
      { count: number; interviewing: number; placed: number }
    >();
    for (const c of candidates) {
      const key = c.source || 'Manual';
      const cur = sourceMap.get(key) || { count: 0, interviewing: 0, placed: 0 };
      cur.count++;
      if (isInterviewingOrBeyond(c.stage)) cur.interviewing++;
      if (isPlaced(c.stage)) cur.placed++;
      sourceMap.set(key, cur);
    }
    const sources: SourceQuality[] = Array.from(sourceMap.entries())
      .map(([source, v]) => ({
        source,
        label: sourceLabel(source),
        count: v.count,
        interviewing: v.interviewing,
        placed: v.placed,
        interviewRate:
          v.count > 0 ? Math.round((v.interviewing / v.count) * 1000) / 10 : 0,
        placementRate:
          v.count > 0 ? Math.round((v.placed / v.count) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Jobs health
    const openJobsList = safeJobs.filter(
      (j) => normalizeJobStatus(j.status) === 'Open'
    );
    const onHoldJobs = safeJobs.filter(
      (j) => normalizeJobStatus(j.status) === 'Paused'
    );
    const closedJobs = safeJobs.filter(
      (j) => normalizeJobStatus(j.status) === 'Closed'
    );
    const openPrev = safeJobs.filter((j) => {
      const created = j.created_at || j.createdAt;
      // approximate: jobs that existed in previous period and were open-ish
      return created && parseDate(created)! < periodStart;
    }).filter((j) => normalizeJobStatus(j.status) === 'Open').length;

    const emptyOpen = openJobsList.filter(
      (j) => !Array.isArray(j.candidates) || j.candidates.length === 0
    );
    const withCandidates = openJobsList.filter(
      (j) => Array.isArray(j.candidates) && j.candidates.length > 0
    );
    const avgCandidatesPerOpen =
      openJobsList.length > 0
        ? Math.round(
            (openJobsList.reduce(
              (s, j) => s + (Array.isArray(j.candidates) ? j.candidates.length : 0),
              0
            ) /
              openJobsList.length) *
              10
          ) / 10
        : 0;

    // Active (open) jobs first — matches dashboard "Active jobs" panel
    const topJobs = [...openJobsList]
      .map((j) => ({
        id: j.id,
        title: j.title || 'Untitled',
        companyName: j.companyName || '—',
        status: normalizeJobStatus(j.status),
        candidateCount: Array.isArray(j.candidates) ? j.candidates.length : 0,
        daysOpen: ageDays(j.created_at || j.createdAt, now),
      }))
      .sort((a, b) => b.candidateCount - a.candidateCount || b.daysOpen - a.daysOpen)
      .slice(0, 8);

    // Time to hire / fill
    const placedForAvg = candidates
      .filter((c) => isPlaced(c.stage))
      .map((c) => ({ start: c.created, end: c.modified }));
    const avgTimeToHire = calculateAvgDays(placedForAvg);

    const closedForFill = closedJobs.map((j) => ({
      start: j.created_at || j.createdAt,
      end: j.modified_at || j.modifiedAt || j.updated_at || j.created_at,
    }));
    const avgTimeToFill = calculateAvgDays(closedForFill);

    // Companies
    const companyStageMap = new Map<string, number>();
    let noContacts = 0;
    let closedWon = 0;
    let lost = 0;
    for (const co of safeCompanies) {
      const st = String(co.status || 'identification')
        .toLowerCase()
        .replace(/\s+/g, '_');
      companyStageMap.set(st, (companyStageMap.get(st) ?? 0) + 1);
      const contacts = Array.isArray(co.contacts) ? co.contacts : [];
      if (contacts.length === 0) noContacts++;
      if (st === 'closed_won' || st === 'won') closedWon++;
      if (st === 'lost') lost++;
    }

    const companiesWithOpenJobs = new Set(
      openJobsList.map((j) => j.companyId).filter(Boolean)
    );
    const noOpenJobs = safeCompanies.filter(
      (c) => c.id && !companiesWithOpenJobs.has(c.id)
    ).length;

    const companyByStage: StageCount[] = COMPANY_STAGE_ORDER.map((s) => ({
      stage: s.key,
      label: s.label,
      count: companyStageMap.get(s.key) ?? 0,
    })).filter((s) => s.count > 0);

    // Needs attention
    const needsAttention: AttentionItem[] = [];

    for (const j of openJobsList) {
      const candCount = Array.isArray(j.candidates) ? j.candidates.length : 0;
      const days = ageDays(j.created_at || j.createdAt, now);
      if (candCount === 0) {
        needsAttention.push({
          id: j.id,
          type: 'job',
          title: j.title || 'Untitled job',
          subtitle: j.companyName || 'No company',
          reason: 'Open job with zero candidates',
          days,
          href: `/dashboard/jobs/${j.id}`,
          severity: days >= 30 ? 'high' : 'medium',
        });
      } else if (days >= 60) {
        needsAttention.push({
          id: j.id,
          type: 'job',
          title: j.title || 'Untitled job',
          subtitle: j.companyName || 'No company',
          reason: `Open for ${days} days`,
          days,
          href: `/dashboard/jobs/${j.id}`,
          severity: days >= 90 ? 'high' : 'medium',
        });
      }
    }

    for (const c of candidates) {
      if (TERMINAL_STAGES.has(c.stage)) continue;
      const days = ageDays(c.modified, now);
      if (days >= 14) {
        needsAttention.push({
          id: c.id,
          type: 'candidate',
          title: c.name,
          subtitle: c.stage.replace(/_/g, ' '),
          reason: `No activity for ${days} days`,
          days,
          href: `/dashboard/candidates/${c.id}`,
          severity: days >= 30 ? 'high' : 'medium',
        });
      }
    }

    for (const co of safeCompanies) {
      const contacts = Array.isArray(co.contacts) ? co.contacts : [];
      const st = String(co.status || '').toLowerCase();
      if (contacts.length === 0 && st !== 'lost') {
        needsAttention.push({
          id: co.id,
          type: 'company',
          title: co.name || co.companyName || 'Company',
          subtitle: st || 'identification',
          reason: 'No contacts on account',
          days: ageDays(co.modified_at || co.updated_at || co.created_at, now),
          href: `/dashboard/companies/${co.id}`,
          severity: 'medium',
        });
      }
    }

    needsAttention.sort((a, b) => {
      const sev = { high: 0, medium: 1, low: 2 };
      return sev[a.severity] - sev[b.severity] || b.days - a.days;
    });

    // Recent events (sample of candidates)
    const recentEvents = await getRecentEventsSafe(
      candidates.slice(0, 40).map((c) => c.id)
    );

    // Insights
    const insights = buildInsights({
      placements: placedThisPeriod.length,
      placementsPrev: placedPrevPeriod.length,
      funnel,
      emptyOpen: emptyOpen.length,
      openJobs: openJobsList.length,
      stalledCandidates: needsAttention.filter((n) => n.type === 'candidate').length,
      topSource: sources[0],
      noContacts,
      avgTimeToHire,
    });

    return {
      totalCandidates: candidates.length,
      placements: placedThisPeriod.length,
      openJobs: openJobsList.length,
      inMotion,
      avgTimeToHire,
      avgTimeToFill,

      placementsKpi: {
        value: placedThisPeriod.length,
        previous: placedPrevPeriod.length,
        deltaPct: deltaPct(placedThisPeriod.length, placedPrevPeriod.length),
        label: 'Placements',
      },
      candidatesAddedKpi: {
        value: addedThisPeriod.length,
        previous: addedPrevPeriod.length,
        deltaPct: deltaPct(addedThisPeriod.length, addedPrevPeriod.length),
        label: 'New candidates',
      },
      openJobsKpi: {
        value: openJobsList.length,
        previous: openPrev,
        deltaPct: deltaPct(openJobsList.length, openPrev),
        label: 'Open jobs',
      },

      funnel,
      pipelineByStage,
      candidatesOverTime,
      previousCandidatesOverTime,
      companiesOverTime,
      sources,

      jobs: {
        open: openJobsList.length,
        onHold: onHoldJobs.length,
        closed: closedJobs.length,
        emptyOpen: emptyOpen.length,
        withCandidates: withCandidates.length,
        avgCandidatesPerOpen,
        topJobs,
      },
      companies: {
        total: safeCompanies.length,
        byStage: companyByStage,
        noContacts,
        noOpenJobs,
        closedWon,
        lost,
      },

      needsAttention: needsAttention.slice(0, 15),
      recentEvents,
      insights,

      periodDays: days,
      periodLabel: periodLabel(period),
      previousPeriodLabel: `Prior ${days} days`,
      lastUpdated: now.toISOString(),
    };
  } catch (error) {
    console.error('[REPORTING] getReportingStats error:', error);
    return getEmptyStats(period);
  }
}

function normalizeJobStatus(
  raw?: string
): 'Open' | 'Paused' | 'Filled' | 'Lost' | 'Closed' {
  const s = String(raw || 'Open')
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, ' ');
  if (s === 'paused' || s === 'on hold' || s === 'onhold' || s === 'hold')
    return 'Paused';
  if (s === 'filled' || s === 'placed' || s === 'hired' || s === 'won')
    return 'Filled';
  if (s === 'lost' || s === 'cancelled' || s === 'canceled') return 'Lost';
  if (s === 'closed' || s === 'close' || s === 'ended') return 'Closed';
  return 'Open';
}

function buildInsights(input: {
  placements: number;
  placementsPrev: number;
  funnel: FunnelStep[];
  emptyOpen: number;
  openJobs: number;
  stalledCandidates: number;
  topSource?: SourceQuality;
  noContacts: number;
  avgTimeToHire: number;
}): string[] {
  const lines: string[] = [];

  if (input.placementsPrev > 0) {
    const d = deltaPct(input.placements, input.placementsPrev);
    if (d !== null) {
      lines.push(
        d >= 0
          ? `Placements are up ${d}% vs the prior period (${input.placements} vs ${input.placementsPrev}).`
          : `Placements are down ${Math.abs(d)}% vs the prior period (${input.placements} vs ${input.placementsPrev}).`
      );
    }
  } else if (input.placements > 0) {
    lines.push(`${input.placements} placement${input.placements === 1 ? '' : 's'} this period.`);
  } else {
    lines.push('No placements recorded in this period — check late-stage pipeline.');
  }

  // Weakest conversion step
  let worst: FunnelStep | null = null;
  for (const step of input.funnel) {
    if (step.conversionFromPrev === null) continue;
    if (!worst || step.conversionFromPrev < (worst.conversionFromPrev ?? 100)) {
      worst = step;
    }
  }
  if (worst && worst.conversionFromPrev !== null && worst.conversionFromPrev < 40) {
    lines.push(
      `Biggest funnel drop is into ${worst.label} (${worst.conversionFromPrev}% conversion from prior step).`
    );
  }

  if (input.emptyOpen > 0) {
    lines.push(
      `${input.emptyOpen} open job${input.emptyOpen === 1 ? '' : 's'} still have zero candidates.`
    );
  } else if (input.openJobs > 0) {
    lines.push(`All ${input.openJobs} open jobs have at least one candidate linked.`);
  }

  if (input.stalledCandidates > 0) {
    lines.push(
      `${input.stalledCandidates} candidate${input.stalledCandidates === 1 ? '' : 's'} idle 14+ days — review Needs Attention.`
    );
  }

  if (input.topSource && input.topSource.count >= 3) {
    lines.push(
      `Top source: ${input.topSource.label} (${input.topSource.count} candidates, ${input.topSource.placementRate}% placed).`
    );
  }

  if (input.noContacts > 0) {
    lines.push(
      `${input.noContacts} compan${input.noContacts === 1 ? 'y has' : 'ies have'} no contacts yet.`
    );
  }

  if (input.avgTimeToHire > 0) {
    lines.push(`Average time-to-hire is ${input.avgTimeToHire} days.`);
  }

  return lines.slice(0, 5);
}

async function getRecentEventsSafe(candidateIds: string[]): Promise<EventData[]> {
  const allEvents: EventData[] = [];
  for (const candidateId of candidateIds.slice(0, 25)) {
    if (!candidateId) continue;
    try {
      const raw = await queryItems<any>(
        eventsTable,
        'PK = :pk AND begins_with(SK, :skPrefix)',
        {
          ':pk': `CANDIDATE#${candidateId}`,
          ':skPrefix': 'EVENT#',
        }
      );
      const events = unwrapItems<any>(raw);
      for (const event of events) {
        allEvents.push({
          id: String(event.SK || event.id || Math.random()).replace('EVENT#', ''),
          candidateId: event.candidateId || candidateId,
          eventType: event.eventType || 'event',
          title: event.title || 'Activity',
          description: event.description,
          createdAt: event.createdAt || event.created_at || '',
          createdBy: event.createdBy || event.created_by || '',
          href: `/dashboard/candidates/${candidateId}`,
        });
      }
    } catch {
      // skip
    }
  }
  allEvents.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return allEvents.slice(0, 20);
}

function getEmptyStats(period: PeriodKey = '30'): ReportingStats {
  const days = periodDays(period);
  return {
    totalCandidates: 0,
    placements: 0,
    openJobs: 0,
    inMotion: 0,
    avgTimeToHire: 0,
    avgTimeToFill: 0,
    placementsKpi: { value: 0, previous: 0, deltaPct: 0, label: 'Placements' },
    candidatesAddedKpi: { value: 0, previous: 0, deltaPct: 0, label: 'New candidates' },
    openJobsKpi: { value: 0, previous: 0, deltaPct: 0, label: 'Open jobs' },
    funnel: FUNNEL_STEPS.map((s) => ({
      key: s.key,
      label: s.label,
      count: 0,
      conversionFromPrev: null,
      shareOfTotal: 0,
    })),
    pipelineByStage: [],
    candidatesOverTime: [],
    previousCandidatesOverTime: [],
    companiesOverTime: [],
    sources: [],
    jobs: {
      open: 0,
      onHold: 0,
      closed: 0,
      emptyOpen: 0,
      withCandidates: 0,
      avgCandidatesPerOpen: 0,
      topJobs: [],
    },
    companies: {
      total: 0,
      byStage: [],
      noContacts: 0,
      noOpenJobs: 0,
      closedWon: 0,
      lost: 0,
    },
    needsAttention: [],
    recentEvents: [],
    insights: ['No data yet for this period. Add candidates, jobs, and companies to unlock insights.'],
    periodDays: days,
    periodLabel: periodLabel(period),
    previousPeriodLabel: `Prior ${days} days`,
    lastUpdated: new Date().toISOString(),
  };
}

// ============================================================================
// Legacy exports (API / embed stubs)
// ============================================================================

export async function generateDashboardEmbedUrl(_options: {
  dashboardId: string;
  tenantId?: string;
  filters?: Array<{ column: string; values: string[]; operator: string }>;
}) {
  return null;
}

export async function getReportingData() {
  const stats = await getReportingStats('30');
  return {
    pipeline: {
      byStage: stats.pipelineByStage.map((s) => ({ stage: s.stage, count: s.count })),
      total: stats.totalCandidates,
    },
    candidates: { total: stats.totalCandidates, byStatus: [] },
    aiUsage: {
      day: { totalTokens: 0, estimatedCost: 0, totalInvocations: 0 },
      week: { totalTokens: 0, estimatedCost: 0, totalInvocations: 0 },
      month: { totalTokens: 0, estimatedCost: 0, totalInvocations: 0 },
    },
  };
}

export function isQuickSightConfigured(): boolean {
  return false;
}

/** @deprecated kept for any old imports */
export async function getPipelineStats(tenantId: string) {
  const stats = await getReportingStats('30');
  return { byStage: stats.pipelineByStage, total: stats.totalCandidates };
}
