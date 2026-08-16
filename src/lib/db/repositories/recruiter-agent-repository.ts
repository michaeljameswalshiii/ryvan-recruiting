import { getItem, putItem, queryItems, bedrockUsageTable, tableNames } from '../dynamodb';
import {
  RECRUITER_AGENT_DEFAULTS,
  type RecruiterAgentConfig,
  type UpdateRecruiterAgentConfig,
} from '@/lib/schemas/recruiter-agent';

function configKey(tenantId: string) {
  return `recruiter-agent-config#${tenantId}`;
}

export function defaultRecruiterAgentConfig(tenantId: string): RecruiterAgentConfig {
  const now = new Date().toISOString();
  return {
    id: configKey(tenantId),
    tenant_id: tenantId,
    type: 'recruiter_agent_config',
    ...RECRUITER_AGENT_DEFAULTS,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getRecruiterAgentConfig(
  tenantId: string
): Promise<RecruiterAgentConfig> {
  try {
    const item = await getItem<RecruiterAgentConfig>(tableNames.profiles, {
      id: configKey(tenantId),
    });
    if (item?.tenant_id === tenantId && item.type === 'recruiter_agent_config') {
      const merged = { ...defaultRecruiterAgentConfig(tenantId), ...item };
      return {
        ...merged,
        maxCandidatesPerRun: Math.min(Number(merged.maxCandidatesPerRun) || 500, 500),
        maxRunsPerDay: Math.min(Number(merged.maxRunsPerDay) || 5, 1000),
      };
    }
  } catch {
    /* Use safe defaults when the settings record does not exist yet. */
  }
  return defaultRecruiterAgentConfig(tenantId);
}

export async function updateRecruiterAgentConfig(
  tenantId: string,
  patch: UpdateRecruiterAgentConfig,
  updatedBy?: string
): Promise<RecruiterAgentConfig> {
  const existing = await getRecruiterAgentConfig(tenantId);
  const now = new Date().toISOString();
  const next: RecruiterAgentConfig = {
    ...existing,
    ...patch,
    reviewFitScore: Math.min(
      Number(patch.reviewFitScore ?? existing.reviewFitScore),
      Number(patch.minFitScore ?? existing.minFitScore)
    ),
    id: configKey(tenantId),
    tenant_id: tenantId,
    type: 'recruiter_agent_config',
    updatedAt: now,
    updatedBy,
  };
  await putItem(tableNames.profiles, next);
  return next;
}

function range(period: 'day' | 'month') {
  const now = new Date();
  const start = new Date(now);
  if (period === 'day') start.setUTCHours(0, 0, 0, 0);
  else {
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
  }
  return { start: start.toISOString(), end: now.toISOString() };
}

export async function getRecruiterAgentUsage(tenantId: string) {
  const result = { dayUsd: 0, monthUsd: 0, dayRuns: 0, monthRuns: 0 };
  for (const period of ['day', 'month'] as const) {
    const { start, end } = range(period);
    try {
      const { items } = await queryItems<any>(
        bedrockUsageTable,
        'PK = :pk AND SK BETWEEN :start AND :end',
        {
          ':pk': `TENANT#${tenantId}`,
          ':start': `USAGE#${start}`,
          ':end': `USAGE#${end}~`,
        }
      );
      const scoped = items.filter((item) =>
        ['fill-job', 'fill-job-enrich', 'recruiter-agent'].includes(item.surface)
      );
      const usd = scoped.reduce((sum, item) => sum + Number(item.estimatedCost || 0), 0);
      if (period === 'day') {
        result.dayUsd = usd;
        result.dayRuns = scoped.length;
      } else {
        result.monthUsd = usd;
        result.monthRuns = scoped.length;
      }
    } catch {
      /* Usage is advisory; never block the app because analytics is unavailable. */
    }
  }
  return result;
}
