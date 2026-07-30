/**
 * Fill-job (Apollo) sourcing runs — shared within a tenant when public.
 *
 * Keys (profiles table):
 *   fill-run#${tenantId}#${runId}
 *   fill-index#${tenantId}#${userId}
 *   fill-public#${tenantId}
 *
 * @serverOnly
 */

import { getItem, putItem, tableNames } from '../dynamodb';

export type FillJobVisibility = 'private' | 'public';

export type FillJobCandidate = {
  id?: string;
  name: string;
  title?: string;
  company?: string;
  location?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  source?: string;
  snippet?: string;
  url?: string;
  qualityScore?: number;
  qualityFlags?: string[];
  fitScore?: number;
  fitReason?: string;
  mustHaveHit?: boolean;
  geoOk?: boolean;
};

export type FillJobRun = {
  id: string;
  tenant_id: string;
  userId: string;
  /** Display email/name of owner for teammates */
  ownerLabel?: string;
  type: 'fill_job_run';
  visibility: FillJobVisibility;
  query: string;
  jobTitle?: string;
  jobLocation?: string;
  count: number;
  estimatedCostUsd: number;
  notes?: string[];
  candidates: FillJobCandidate[];
  apolloPlan?: Record<string, unknown>;
  apolloPlanSource?: string;
  usageLine?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function runKey(tenantId: string, runId: string): string {
  return `fill-run#${tenantId}#${runId}`;
}

function indexKey(tenantId: string, userId: string): string {
  return `fill-index#${tenantId}#${userId}`;
}

function publicIndexKey(tenantId: string): string {
  return `fill-public#${tenantId}`;
}

export function normalizeVisibility(v?: string | null): FillJobVisibility {
  return v === 'public' ? 'public' : 'private';
}

export function canViewFillJobRun(
  run: Pick<FillJobRun, 'userId' | 'visibility'>,
  userId: string
): boolean {
  if (run.userId === userId) return true;
  return normalizeVisibility(run.visibility) === 'public';
}

export function canManageFillJobRun(
  run: Pick<FillJobRun, 'userId'>,
  userId: string
): boolean {
  return run.userId === userId;
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
  runId: string
): Promise<void> {
  const key = indexKey(tenantId, userId);
  const existing = await getIndex(key);
  const ids = existing?.ids ? [...existing.ids] : [];
  if (!ids.includes(runId)) ids.unshift(runId);
  await putItem(tableNames.profiles, {
    id: key,
    tenant_id: tenantId,
    type: 'fill_job_run_index',
    ids: ids.slice(0, 40),
    updatedAt: new Date().toISOString(),
  } satisfies IdIndex);
}

async function addToPublicIndex(tenantId: string, runId: string): Promise<void> {
  const key = publicIndexKey(tenantId);
  const existing = await getIndex(key);
  const ids = existing?.ids ? [...existing.ids] : [];
  if (!ids.includes(runId)) ids.unshift(runId);
  await putItem(tableNames.profiles, {
    id: key,
    tenant_id: tenantId,
    type: 'fill_job_run_public_index',
    ids: ids.slice(0, 80),
    updatedAt: new Date().toISOString(),
  } satisfies IdIndex);
}

async function removeFromPublicIndex(
  tenantId: string,
  runId: string
): Promise<void> {
  const key = publicIndexKey(tenantId);
  const existing = await getIndex(key);
  if (!existing?.ids?.length) return;
  const ids = existing.ids.filter((x) => x !== runId);
  await putItem(tableNames.profiles, {
    id: key,
    tenant_id: tenantId,
    type: 'fill_job_run_public_index',
    ids,
    updatedAt: new Date().toISOString(),
  } satisfies IdIndex);
}

function slimCandidates(list: FillJobCandidate[]): FillJobCandidate[] {
  return (list || []).slice(0, 40).map((c) => ({
    id: c.id,
    name: String(c.name || '').slice(0, 200),
    title: c.title ? String(c.title).slice(0, 200) : undefined,
    company: c.company ? String(c.company).slice(0, 200) : undefined,
    location: c.location ? String(c.location).slice(0, 200) : undefined,
    email: c.email ? String(c.email).slice(0, 120) : undefined,
    phone: c.phone ? String(c.phone).slice(0, 40) : undefined,
    linkedinUrl: c.linkedinUrl ? String(c.linkedinUrl).slice(0, 400) : undefined,
    source: c.source,
    snippet: c.snippet ? String(c.snippet).slice(0, 400) : undefined,
    url: c.url ? String(c.url).slice(0, 400) : undefined,
    qualityScore: c.qualityScore,
    qualityFlags: c.qualityFlags?.slice(0, 10),
    fitScore: c.fitScore,
    fitReason: c.fitReason ? String(c.fitReason).slice(0, 300) : undefined,
    mustHaveHit: c.mustHaveHit,
    geoOk: c.geoOk,
  }));
}

export async function createFillJobRun(
  tenantId: string,
  userId: string,
  input: {
    query: string;
    visibility?: FillJobVisibility;
    ownerLabel?: string;
    jobTitle?: string;
    jobLocation?: string;
    estimatedCostUsd?: number;
    notes?: string[];
    candidates?: FillJobCandidate[];
    apolloPlan?: Record<string, unknown>;
    apolloPlanSource?: string;
    usageLine?: string;
    error?: string;
  }
): Promise<FillJobRun> {
  const now = new Date().toISOString();
  const id = generateId();
  const visibility = normalizeVisibility(input.visibility);
  const candidates = slimCandidates(input.candidates || []);
  const run: FillJobRun = {
    id,
    tenant_id: tenantId,
    userId,
    ownerLabel: input.ownerLabel
      ? String(input.ownerLabel).slice(0, 120)
      : undefined,
    type: 'fill_job_run',
    visibility,
    query: String(input.query || '').slice(0, 4000),
    jobTitle: input.jobTitle
      ? String(input.jobTitle).slice(0, 300)
      : undefined,
    jobLocation: input.jobLocation
      ? String(input.jobLocation).slice(0, 200)
      : undefined,
    count: candidates.length,
    estimatedCostUsd:
      typeof input.estimatedCostUsd === 'number' ? input.estimatedCostUsd : 0,
    notes: (input.notes || []).slice(0, 20).map((n) => String(n).slice(0, 400)),
    candidates,
    apolloPlan: input.apolloPlan,
    apolloPlanSource: input.apolloPlanSource,
    usageLine: input.usageLine
      ? String(input.usageLine).slice(0, 500)
      : undefined,
    error: input.error ? String(input.error).slice(0, 500) : undefined,
    createdAt: now,
    updatedAt: now,
  };

  await putItem(tableNames.profiles, {
    id: runKey(tenantId, id),
    ...run,
  });
  await addToIndex(tenantId, userId, id);
  if (visibility === 'public') {
    await addToPublicIndex(tenantId, id);
  }
  return run;
}

export async function getFillJobRun(
  tenantId: string,
  runId: string
): Promise<FillJobRun | null> {
  const short = runId.includes('#')
    ? runId.split('#').pop() || runId
    : runId;
  try {
    const item = await getItem<FillJobRun & { id: string }>(
      tableNames.profiles,
      { id: runKey(tenantId, short) }
    );
    if (!item || item.type !== 'fill_job_run') return null;
    return {
      ...item,
      id: short,
      visibility: normalizeVisibility(item.visibility),
    };
  } catch {
    return null;
  }
}

export async function listFillJobRunsForUser(
  tenantId: string,
  userId: string
): Promise<FillJobRun[]> {
  const ownIdx = await getIndex(indexKey(tenantId, userId));
  const pubIdx = await getIndex(publicIndexKey(tenantId));
  const idOrder: string[] = [];
  const seen = new Set<string>();
  for (const rid of [...(ownIdx?.ids || []), ...(pubIdx?.ids || [])]) {
    if (!rid || seen.has(rid)) continue;
    seen.add(rid);
    idOrder.push(rid);
  }
  if (idOrder.length === 0) return [];

  const runs: FillJobRun[] = [];
  for (const rid of idOrder.slice(0, 30)) {
    const r = await getFillJobRun(tenantId, rid);
    if (!r) continue;
    if (!canViewFillJobRun(r, userId)) continue;
    runs.push(r);
  }
  runs.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return runs;
}

export async function setFillJobRunVisibility(
  tenantId: string,
  userId: string,
  runId: string,
  visibility: FillJobVisibility
): Promise<FillJobRun | null> {
  const run = await getFillJobRun(tenantId, runId);
  if (!run || !canManageFillJobRun(run, userId)) return null;
  const next = normalizeVisibility(visibility);
  if (next === 'public') {
    await addToPublicIndex(tenantId, run.id);
  } else {
    await removeFromPublicIndex(tenantId, run.id);
  }
  const updated: FillJobRun = {
    ...run,
    visibility: next,
    updatedAt: new Date().toISOString(),
  };
  await putItem(tableNames.profiles, {
    id: runKey(tenantId, run.id),
    ...updated,
  });
  return updated;
}
