/**
 * Candidate List Builder jobs — stored in profiles table (parallel to company list-builder).
 *
 * Keys:
 *   clb-job#${tenantId}#${jobId}
 *   clb-index#${tenantId}#${userId}
 *   clb-public#${tenantId}
 *
 * @serverOnly
 */

import { getItem, putItem, tableNames } from '../dynamodb';
import type {
  CreateCandidateListBuilderInput,
  CandidateListBuilderJob,
  CandidateListBuilderResultRow,
  CandidateListBuilderStatus,
  CandidateListBuilderVisibility,
} from '../../schemas/candidate-list-builder';
import { CANDIDATE_LIST_BUILDER_DEFAULTS } from '../../schemas/candidate-list-builder';
import {
  parseCandidateBrief,
} from '@/lib/pdl/client';
import { resolveTargetGeography } from '@/lib/list-builder/geo';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function jobKey(tenantId: string, jobId: string): string {
  return `clb-job#${tenantId}#${jobId}`;
}

function indexKey(tenantId: string, userId: string): string {
  return `clb-index#${tenantId}#${userId}`;
}

function publicIndexKey(tenantId: string): string {
  return `clb-public#${tenantId}`;
}

export function normalizeVisibility(
  v?: string | null
): CandidateListBuilderVisibility {
  return v === 'public' ? 'public' : 'private';
}

export function canViewCandidateListBuilderJob(
  job: Pick<CandidateListBuilderJob, 'userId' | 'visibility'>,
  userId: string
): boolean {
  if (job.userId === userId) return true;
  return normalizeVisibility(job.visibility) === 'public';
}

export function canManageCandidateListBuilderJob(
  job: Pick<CandidateListBuilderJob, 'userId'>,
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
  const trimmed = ids.slice(0, 50);
  await putItem(tableNames.profiles, {
    id: key,
    tenant_id: tenantId,
    type: 'candidate_list_builder_index',
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
    type: 'candidate_list_builder_public_index',
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
  const v =
    typeof n === 'number' && Number.isFinite(n)
      ? Math.floor(n)
      : CANDIDATE_LIST_BUILDER_DEFAULTS.targetSize;
  return Math.min(
    Math.max(v, 1),
    CANDIDATE_LIST_BUILDER_DEFAULTS.maxResultsCap
  );
}

function publicJob(
  raw: CandidateListBuilderJob & { jobId?: string }
): CandidateListBuilderJob {
  const shortId =
    raw.jobId ||
    (raw.id.includes('#') ? raw.id.split('#').pop()! : raw.id);
  return {
    ...raw,
    id: shortId,
    visibility: normalizeVisibility(raw.visibility),
  };
}

export async function countActiveCandidateJobs(
  tenantId: string,
  userId: string
): Promise<number> {
  const jobs = await listCandidateJobsForUser(tenantId, userId);
  return jobs.filter((j) =>
    ['queued', 'running', 'paused'].includes(j.status)
  ).length;
}

export async function createCandidateListBuilderJob(
  tenantId: string,
  userId: string,
  input: CreateCandidateListBuilderInput
): Promise<{ job?: CandidateListBuilderJob; error?: string }> {
  const active = await countActiveCandidateJobs(tenantId, userId);
  if (active >= CANDIDATE_LIST_BUILDER_DEFAULTS.maxConcurrentPerUser) {
    return {
      error: `You already have ${active} active candidate agents (max ${CANDIDATE_LIST_BUILDER_DEFAULTS.maxConcurrentPerUser}). Pause or cancel one first.`,
    };
  }

  const brief = (input.brief || '').trim();
  if (!brief) {
    return { error: 'Describe the candidates you want to source.' };
  }

  const parsed = parseCandidateBrief(brief);
  const fromBrief = parsed.targetSize;
  const targetSize = clampTarget(
    input.targetSize != null && Number.isFinite(Number(input.targetSize))
      ? Number(input.targetSize)
      : fromBrief
  );

  const geography = resolveTargetGeography(
    brief,
    (input.geography || '').trim() ||
      parsed.locations[0] ||
      CANDIDATE_LIST_BUILDER_DEFAULTS.geography
  );

  const titles =
    input.titles?.length ? input.titles : parsed.titles;
  const industries =
    input.industries?.length ? input.industries : parsed.industries;
  const companies =
    input.companies?.length ? input.companies : parsed.companies;
  const keywords =
    input.keywords?.length ? input.keywords : parsed.keywords;

  const now = new Date();
  const jobId = generateId();
  const visibility = normalizeVisibility(
    input.visibility || CANDIDATE_LIST_BUILDER_DEFAULTS.visibility
  );

  const job: CandidateListBuilderJob & { jobId: string } = {
    id: jobKey(tenantId, jobId),
    jobId,
    tenant_id: tenantId,
    userId,
    type: 'candidate_list_builder',
    status: 'queued',
    visibility,
    brief,
    geography,
    targetSize,
    titles,
    industries,
    companies,
    keywords,
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
      estimatedCostUsd: 0,
      pdlCalls: 0,
      pdlReturned: 0,
      lastMessage: `Queued — People Data Labs search for ${targetSize} candidates in ${geography}…`,
    },
    notifyChannels: input.notifyChannels?.length
      ? input.notifyChannels
      : ['in_app'],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + CANDIDATE_LIST_BUILDER_DEFAULTS.timeoutMs
    ).toISOString(),
    discoveryBatch: 0,
  };

  await putItem(tableNames.profiles, job);
  await addToIndex(tenantId, userId, jobId);
  if (visibility === 'public') {
    await addToPublicIndex(tenantId, jobId);
  }

  return { job: publicJob(job) };
}

export async function getCandidateListBuilderJob(
  tenantId: string,
  jobId: string
): Promise<CandidateListBuilderJob | null> {
  const key = jobId.startsWith('clb-job#')
    ? jobId
    : jobKey(tenantId, jobId);
  try {
    const item = await getItem<CandidateListBuilderJob & { jobId?: string }>(
      tableNames.profiles,
      { id: key }
    );
    if (!item || item.type !== 'candidate_list_builder') return null;
    if (item.tenant_id !== tenantId) return null;
    return publicJob(item);
  } catch {
    return null;
  }
}

function summarizeJobForList(
  j: CandidateListBuilderJob,
  includeResults: boolean
): CandidateListBuilderJob {
  const all = j.results || [];
  let completeFound = 0;
  let partialFound = 0;
  for (const r of all) {
    const email = (r.email || '').trim();
    const phone = (r.phone || '').trim();
    const hasEmail = !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const hasPhone = !!phone && (phone.match(/\d/g) || []).length >= 7;
    if (hasEmail && hasPhone) completeFound++;
    else if (hasEmail || hasPhone || r.linkedinUrl) partialFound++;
  }
  const progress = {
    ...j.progress,
    found: all.length || j.progress?.found || 0,
    completeFound: j.progress?.completeFound ?? completeFound,
    partialFound: j.progress?.partialFound ?? partialFound,
  };
  if (includeResults) return { ...j, progress };
  return {
    ...j,
    results: all.slice(0, 3),
    progress,
  };
}

export async function listCandidateJobsForUser(
  tenantId: string,
  userId: string,
  options?: { includeResults?: boolean }
): Promise<CandidateListBuilderJob[]> {
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

  const jobs: CandidateListBuilderJob[] = [];
  for (const jid of idOrder.slice(0, 40)) {
    const j = await getCandidateListBuilderJob(tenantId, jid);
    if (!j) continue;
    if (!canViewCandidateListBuilderJob(j, userId)) continue;
    jobs.push(summarizeJobForList(j, includeResults));
  }
  jobs.sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
  return jobs;
}

export async function setCandidateListBuilderVisibility(
  tenantId: string,
  userId: string,
  jobId: string,
  visibility: CandidateListBuilderVisibility
): Promise<CandidateListBuilderJob | null> {
  const job = await getCandidateListBuilderJob(tenantId, jobId);
  if (!job || !canManageCandidateListBuilderJob(job, userId)) return null;
  const next = normalizeVisibility(visibility);
  const shortId = job.id;
  if (next === 'public') {
    await addToPublicIndex(tenantId, shortId);
  } else {
    await removeFromPublicIndex(tenantId, shortId);
  }
  return updateCandidateListBuilderJob(tenantId, jobId, { visibility: next });
}

export async function updateCandidateListBuilderJob(
  tenantId: string,
  jobId: string,
  patch: Partial<CandidateListBuilderJob>
): Promise<CandidateListBuilderJob | null> {
  const key = jobId.startsWith('clb-job#')
    ? jobId
    : jobKey(tenantId, jobId);
  const existing = await getItem<CandidateListBuilderJob & { jobId?: string }>(
    tableNames.profiles,
    { id: key }
  );
  if (!existing || existing.type !== 'candidate_list_builder') return null;
  if (existing.tenant_id !== tenantId) return null;

  const shortId =
    existing.jobId ||
    (existing.id.includes('#') ? existing.id.split('#').pop()! : existing.id);

  const next: CandidateListBuilderJob & { jobId: string } = {
    ...existing,
    ...patch,
    id: key,
    jobId: shortId,
    tenant_id: tenantId,
    type: 'candidate_list_builder' as const,
    updatedAt: new Date().toISOString(),
  };

  if (
    Object.prototype.hasOwnProperty.call(patch, 'lockedUntil') &&
    !patch.lockedUntil
  ) {
    delete (next as { lockedUntil?: string }).lockedUntil;
  }

  await putItem(tableNames.profiles, next);
  return publicJob(next);
}

export async function appendCandidateResults(
  tenantId: string,
  jobId: string,
  rows: CandidateListBuilderResultRow[]
): Promise<CandidateListBuilderJob | null> {
  const job = await getCandidateListBuilderJob(tenantId, jobId);
  if (!job) return null;
  const results = [...(job.results || []), ...rows];
  const seen = new Set<string>();
  const deduped: CandidateListBuilderResultRow[] = [];
  for (const r of results) {
    const k =
      (r.pdlId && `pdl:${r.pdlId}`) ||
      (r.email && `em:${r.email.toLowerCase()}`) ||
      (r.linkedinUrl && `li:${r.linkedinUrl.toLowerCase()}`) ||
      `nm:${(r.name || '').toLowerCase()}|${(r.company || '').toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(r);
  }
  return updateCandidateListBuilderJob(tenantId, jobId, {
    results: deduped,
    progress: {
      ...job.progress,
      found: deduped.length,
      target: job.targetSize,
    },
  });
}

export async function setCandidateJobStatus(
  tenantId: string,
  jobId: string,
  status: CandidateListBuilderStatus,
  extra?: Partial<CandidateListBuilderJob>
): Promise<CandidateListBuilderJob | null> {
  const patch: Partial<CandidateListBuilderJob> = { status, ...extra };
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
  return updateCandidateListBuilderJob(tenantId, jobId, patch);
}
