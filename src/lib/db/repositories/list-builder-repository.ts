/**
 * List Builder jobs — stored in profiles table (same pattern as sequences).
 *
 * Keys:
 *   lb-job#${tenantId}#${jobId}
 *   lb-index#${tenantId}#${userId}     — per-user private + owned jobs
 *   lb-public#${tenantId}              — job ids shared with the whole tenant
 *
 * @serverOnly
 */

import { getItem, putItem, deleteItem, tableNames } from '../dynamodb';
import type {
  CreateListBuilderInput,
  ListBuilderJob,
  ListBuilderResultRow,
  ListBuilderStatus,
  ListBuilderVisibility,
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

function publicIndexKey(tenantId: string): string {
  return `lb-public#${tenantId}`;
}

/** Normalize missing field on older jobs → private. */
export function normalizeVisibility(
  v?: string | null
): ListBuilderVisibility {
  return v === 'public' ? 'public' : 'private';
}

export function canViewListBuilderJob(
  job: Pick<ListBuilderJob, 'userId' | 'visibility'>,
  userId: string
): boolean {
  if (job.userId === userId) return true;
  return normalizeVisibility(job.visibility) === 'public';
}

/** Pause / resume / cancel / delete — owner only. */
export function canManageListBuilderJob(
  job: Pick<ListBuilderJob, 'userId'>,
  userId: string
): boolean {
  return job.userId === userId;
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

async function addToPublicIndex(tenantId: string, jobId: string): Promise<void> {
  const key = publicIndexKey(tenantId);
  const existing = await getIndex(key);
  const ids = existing?.ids ? [...existing.ids] : [];
  if (!ids.includes(jobId)) ids.unshift(jobId);
  const trimmed = ids.slice(0, 100);
  await putItem(tableNames.profiles, {
    id: key,
    tenant_id: tenantId,
    type: 'list_builder_public_index',
    ids: trimmed,
    updatedAt: new Date().toISOString(),
  } satisfies IdIndex);
}

async function removeFromPublicIndex(
  tenantId: string,
  jobId: string
): Promise<void> {
  const key = publicIndexKey(tenantId);
  const existing = await getIndex(key);
  if (!existing?.ids?.length) return;
  const next = existing.ids.filter((x) => x !== jobId);
  if (next.length === existing.ids.length) return;
  await putItem(tableNames.profiles, {
    ...existing,
    ids: next,
    updatedAt: new Date().toISOString(),
  });
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
  const visibility = normalizeVisibility(
    input.visibility || LIST_BUILDER_DEFAULTS.visibility
  );
  // Prefer specific place from the brief (e.g. Brevard County) over generic "United States"
  const { resolveTargetGeography, inferIndustryKeywords } = await import(
    '@/lib/list-builder/geo'
  );
  const geography = resolveTargetGeography(
    brief,
    (input.geography || '').trim() || LIST_BUILDER_DEFAULTS.geography
  );
  const industryFromBrief =
    (input.industry || '').trim() ||
    inferIndustryKeywords(brief)[0] ||
    undefined;

  const job: ListBuilderJob = {
    id: jobKey(tenantId, jobId),
    tenant_id: tenantId,
    userId,
    type: 'list_builder',
    status: 'queued',
    visibility,
    brief: brief || 'Seed list enrichment',
    industry: industryFromBrief,
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
      lastMessage: `Queued — targeting ${geography}, aiming for ${targetSize} usable leads…`,
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
  if (visibility === 'public') {
    await addToPublicIndex(tenantId, jobId);
  }

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
    visibility: normalizeVisibility(raw.visibility),
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

function summarizeJobForList(
  j: ListBuilderJob,
  includeResults: boolean
): ListBuilderJob {
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
    return { ...j, progress };
  }
  // Lightweight list payload — full results loaded on expand
  return {
    ...j,
    results: all.slice(0, 3),
    seedRows: [],
    progress,
  };
}

/**
 * Own jobs + public jobs shared by anyone on the same tenant.
 */
export async function listJobsForUser(
  tenantId: string,
  userId: string,
  options?: { includeResults?: boolean }
): Promise<ListBuilderJob[]> {
  const includeResults = options?.includeResults === true;
  const ownIdx = await getIndex(indexKey(tenantId, userId));
  const pubIdx = await getIndex(publicIndexKey(tenantId));
  const idOrder: string[] = [];
  const seen = new Set<string>();
  for (const jid of [...(ownIdx?.ids || []), ...(pubIdx?.ids || [])]) {
    if (!jid || seen.has(jid)) continue;
    seen.add(jid);
    idOrder.push(jid);
  }
  if (idOrder.length === 0) return [];

  const jobs: ListBuilderJob[] = [];
  for (const jid of idOrder.slice(0, 40)) {
    const j = await getListBuilderJob(tenantId, jid);
    if (!j) continue;
    if (!canViewListBuilderJob(j, userId)) continue;
    jobs.push(summarizeJobForList(j, includeResults));
  }
  // Newest first
  jobs.sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
  return jobs;
}

/** Owner can flip private ↔ public after create. */
export async function setListBuilderVisibility(
  tenantId: string,
  userId: string,
  jobId: string,
  visibility: ListBuilderVisibility
): Promise<ListBuilderJob | null> {
  const job = await getListBuilderJob(tenantId, jobId);
  if (!job || !canManageListBuilderJob(job, userId)) return null;
  const next = normalizeVisibility(visibility);
  const shortId = job.id;
  if (next === 'public') {
    await addToPublicIndex(tenantId, shortId);
  } else {
    await removeFromPublicIndex(tenantId, shortId);
  }
  return updateListBuilderJob(tenantId, jobId, { visibility: next });
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
  const shortId = jobId.includes('#') ? jobId.split('#').pop()! : jobId;
  try {
    const existing = await getItem<ListBuilderJob & { jobId?: string }>(
      tableNames.profiles,
      { id: key }
    );
    if (existing && existing.userId !== userId) return false;
    await deleteItem(tableNames.profiles, { id: key });
    const idx = await getIndex(indexKey(tenantId, userId));
    if (idx?.ids) {
      await putItem(tableNames.profiles, {
        ...idx,
        ids: idx.ids.filter((x) => x !== shortId && x !== jobId && !key.endsWith(x)),
        updatedAt: new Date().toISOString(),
      });
    }
    await removeFromPublicIndex(tenantId, shortId);
    return true;
  } catch {
    return false;
  }
}

export { jobKey, indexKey, publicIndexKey, generateId as generateListBuilderId };
