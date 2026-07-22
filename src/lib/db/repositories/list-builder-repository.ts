/**
 * List Builder jobs — stored in profiles table (same pattern as sequences).
 *
 * Keys:
 *   lb-job#${tenantId}#${jobId}
 *   lb-index#${tenantId}#${userId}
 *
 * @serverOnly
 */

import { getItem, putItem, deleteItem, tableNames } from '../dynamodb';
import type {
  CreateListBuilderInput,
  ListBuilderJob,
  ListBuilderResultRow,
  ListBuilderStatus,
} from '../../schemas/list-builder';
import { LIST_BUILDER_DEFAULTS } from '../../schemas/list-builder';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function jobKey(tenantId: string, jobId: string): string {
  return `lb-job#${tenantId}#${jobId}`;
}

function indexKey(tenantId: string, userId: string): string {
  return `lb-index#${tenantId}#${userId}`;
}

interface IdIndex {
  id: string;
  tenant_id: string;
  type: string;
  ids: string[];
  updatedAt: string;
}

async function getIndex(key: string): Promise<IdIndex | null> {
  try {
    return await getItem<IdIndex>(tableNames.profiles, { id: key });
  } catch {
    return null;
  }
}

async function addToIndex(
  tenantId: string,
  userId: string,
  jobId: string
): Promise<void> {
  const key = indexKey(tenantId, userId);
  const existing = await getIndex(key);
  const ids = existing?.ids ? [...existing.ids] : [];
  if (!ids.includes(jobId)) ids.unshift(jobId);
  // Keep last 50 job ids
  const trimmed = ids.slice(0, 50);
  await putItem(tableNames.profiles, {
    id: key,
    tenant_id: tenantId,
    type: 'list_builder_index',
    ids: trimmed,
    updatedAt: new Date().toISOString(),
  } satisfies IdIndex);
}

function clampTarget(n?: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : LIST_BUILDER_DEFAULTS.targetSize;
  return Math.min(Math.max(v, 1), LIST_BUILDER_DEFAULTS.maxResultsCap);
}

export async function countActiveJobs(
  tenantId: string,
  userId: string
): Promise<number> {
  const jobs = await listJobsForUser(tenantId, userId);
  return jobs.filter((j) =>
    ['queued', 'running', 'paused'].includes(j.status)
  ).length;
}

export async function createListBuilderJob(
  tenantId: string,
  userId: string,
  input: CreateListBuilderInput
): Promise<{ job?: ListBuilderJob; error?: string }> {
  const active = await countActiveJobs(tenantId, userId);
  if (active >= LIST_BUILDER_DEFAULTS.maxConcurrentPerUser) {
    return {
      error: `You already have ${active} active list-builder jobs (max ${LIST_BUILDER_DEFAULTS.maxConcurrentPerUser}). Pause or cancel one first.`,
    };
  }

  const brief = (input.brief || '').trim();
  if (!brief && !(input.seedRows && input.seedRows.length)) {
    return { error: 'Describe the market to research, or upload a seed list.' };
  }

  const now = new Date();
  const jobId = generateId();
  const targetSize = clampTarget(input.targetSize);
  const geography =
    (input.geography || '').trim() || LIST_BUILDER_DEFAULTS.geography;

  const job: ListBuilderJob = {
    id: jobKey(tenantId, jobId),
    tenant_id: tenantId,
    userId,
    type: 'list_builder',
    status: 'queued',
    brief: brief || 'Seed list enrichment',
    industry: (input.industry || '').trim() || undefined,
    geography,
    targetSize,
    seedRows: Array.isArray(input.seedRows) ? input.seedRows.slice(0, 500) : [],
    results: [],
    progress: {
      found: 0,
      target: targetSize,
      batchesCompleted: 0,
      researched: 0,
      completeFound: 0,
      partialFound: 0,
      emptyBatchStreak: 0,
      errorStreak: 0,
      lastMessage: 'Queued — starting shortly…',
    },
    notifyChannels: input.notifyChannels?.length
      ? input.notifyChannels
      : ['in_app'],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + LIST_BUILDER_DEFAULTS.timeoutMs
    ).toISOString(),
    seedCursor: 0,
    discoveryBatch: 0,
  };

  // Store with short id in a field for API; Dynamo id is full key
  const stored = { ...job, jobId };
  await putItem(tableNames.profiles, stored);
  await addToIndex(tenantId, userId, jobId);

  return { job: publicJob(stored as ListBuilderJob & { jobId: string }) };
}

function publicJob(
  raw: ListBuilderJob & { jobId?: string }
): ListBuilderJob {
  const shortId =
    raw.jobId ||
    (raw.id.includes('#') ? raw.id.split('#').pop()! : raw.id);
  return {
    ...raw,
    id: shortId,
  };
}

export async function getListBuilderJob(
  tenantId: string,
  jobId: string
): Promise<ListBuilderJob | null> {
  const key = jobId.startsWith('lb-job#')
    ? jobId
    : jobKey(tenantId, jobId);
  try {
    const item = await getItem<ListBuilderJob & { jobId?: string }>(
      tableNames.profiles,
      { id: key }
    );
    if (!item || item.type !== 'list_builder') return null;
    if (item.tenant_id !== tenantId) return null;
    return publicJob(item);
  } catch {
    return null;
  }
}

export async function listJobsForUser(
  tenantId: string,
  userId: string,
  options?: { includeResults?: boolean }
): Promise<ListBuilderJob[]> {
  const idx = await getIndex(indexKey(tenantId, userId));
  if (!idx?.ids?.length) return [];
  const includeResults = options?.includeResults === true;
  const jobs: ListBuilderJob[] = [];
  for (const jid of idx.ids.slice(0, 30)) {
    const j = await getListBuilderJob(tenantId, jid);
    if (!j) continue;
    const all = j.results || [];
    let completeFound = 0;
    let partialFound = 0;
    for (const r of all) {
      const email = (r.email || '').trim();
      const phone = (r.phone || '').trim();
      const hasEmail = !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      const hasPhone = !!phone && (phone.match(/\d/g) || []).length >= 7;
      if (hasEmail && hasPhone) completeFound++;
      else if (hasEmail || hasPhone) partialFound++;
    }
    const progress = {
      ...j.progress,
      found: all.length || j.progress?.found || 0,
      completeFound: j.progress?.completeFound ?? completeFound,
      partialFound: j.progress?.partialFound ?? partialFound,
    };
    if (includeResults) {
      jobs.push({ ...j, progress });
    } else {
      // Lightweight list payload — full results loaded on expand
      jobs.push({
        ...j,
        results: all.slice(0, 3),
        seedRows: [],
        progress,
      });
    }
  }
  return jobs;
}

/** Jobs that cron should advance */
export async function listRunnableJobs(limit = 20): Promise<
  Array<ListBuilderJob & { storageId: string }>
> {
  // Scan is heavy; for v1 we rely on per-user index + active tenants via cron
  // Caller passes tenant list and we walk indexes — see processAllTenants.
  return [];
}

export async function updateListBuilderJob(
  tenantId: string,
  jobId: string,
  patch: Partial<ListBuilderJob>
): Promise<ListBuilderJob | null> {
  const key = jobId.startsWith('lb-job#')
    ? jobId
    : jobKey(tenantId, jobId);
  const existing = await getItem<ListBuilderJob & { jobId?: string }>(
    tableNames.profiles,
    { id: key }
  );
  if (!existing || existing.type !== 'list_builder') return null;
  if (existing.tenant_id !== tenantId) return null;

  const shortId =
    existing.jobId ||
    (existing.id.includes('#') ? existing.id.split('#').pop()! : existing.id);

  const next: ListBuilderJob & { jobId: string } = {
    ...existing,
    ...patch,
    id: key,
    jobId: shortId,
    tenant_id: tenantId,
    type: 'list_builder' as const,
    updatedAt: new Date().toISOString(),
  };

  // Allow clearing soft lock explicitly
  if (Object.prototype.hasOwnProperty.call(patch, 'lockedUntil') && !patch.lockedUntil) {
    delete (next as { lockedUntil?: string }).lockedUntil;
  }

  await putItem(tableNames.profiles, next);
  return publicJob(next);
}

export async function appendResults(
  tenantId: string,
  jobId: string,
  rows: ListBuilderResultRow[]
): Promise<ListBuilderJob | null> {
  const job = await getListBuilderJob(tenantId, jobId);
  if (!job) return null;
  const results = [...(job.results || []), ...rows];
  // Dedupe by company name + website
  const seen = new Set<string>();
  const deduped: ListBuilderResultRow[] = [];
  for (const r of results) {
    const k = `${(r.companyName || '').toLowerCase()}|${(r.website || '').toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(r);
  }
  return updateListBuilderJob(tenantId, jobId, {
    results: deduped,
    progress: {
      ...job.progress,
      found: deduped.length,
      target: job.targetSize,
    },
  });
}

export async function setJobStatus(
  tenantId: string,
  jobId: string,
  status: ListBuilderStatus,
  extra?: Partial<ListBuilderJob>
): Promise<ListBuilderJob | null> {
  const patch: Partial<ListBuilderJob> = { status, ...extra };
  if (status === 'running' && !extra?.startedAt) {
    patch.startedAt = new Date().toISOString();
  }
  if (
    status === 'completed' ||
    status === 'cancelled' ||
    status === 'failed' ||
    status === 'awaiting_import'
  ) {
    patch.completedAt = new Date().toISOString();
  }
  return updateListBuilderJob(tenantId, jobId, patch);
}

export async function deleteListBuilderJob(
  tenantId: string,
  userId: string,
  jobId: string
): Promise<boolean> {
  const key = jobId.startsWith('lb-job#')
    ? jobId
    : jobKey(tenantId, jobId);
  try {
    await deleteItem(tableNames.profiles, { id: key });
    const idx = await getIndex(indexKey(tenantId, userId));
    if (idx?.ids) {
      await putItem(tableNames.profiles, {
        ...idx,
        ids: idx.ids.filter((x) => x !== jobId && !key.endsWith(x)),
        updatedAt: new Date().toISOString(),
      });
    }
    return true;
  } catch {
    return false;
  }
}

export { jobKey, indexKey, generateId as generateListBuilderId };
