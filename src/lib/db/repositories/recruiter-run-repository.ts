import { getItem, putItem, scanItems, tableNames } from '../dynamodb';
import type { RecruiterRun, RecruiterRunStatus } from '@/lib/schemas/recruiter-run';

function key(tenantId: string, runId: string) {
  return `recruiter-run#${tenantId}#${runId}`;
}

function id() {
  return crypto.randomUUID();
}

export async function createRecruiterRun(input: Omit<RecruiterRun, 'id' | 'type' | 'createdAt' | 'updatedAt'>) {
  const now = new Date().toISOString();
  const run: RecruiterRun = {
    ...input,
    id: key(input.tenant_id, id()),
    type: 'recruiter_agent_run',
    createdAt: now,
    updatedAt: now,
  };
  await putItem(tableNames.profiles, run);
  return run;
}

export async function getRecruiterRun(tenantId: string, runId: string) {
  return getItem<RecruiterRun>(tableNames.profiles, {
    id: runId.startsWith('recruiter-run#') ? runId : key(tenantId, runId),
  });
}

export async function updateRecruiterRun(tenantId: string, runId: string, patch: Partial<RecruiterRun>) {
  const current = await getRecruiterRun(tenantId, runId);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await putItem(tableNames.profiles, next);
  return next;
}

export async function listRecruiterRuns(tenantId: string, userId: string) {
  const rows = await scanItems<RecruiterRun>(tableNames.profiles, 'tenant_id = :tenant AND #type = :type', {
    ':tenant': tenantId,
    ':type': 'recruiter_agent_run',
  }, { '#type': 'type' });
  return rows
    .filter((run) => run.userId === userId || run.visibility === 'public')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listRunnableRecruiterRuns() {
  const rows = await scanItems<RecruiterRun>(tableNames.profiles, '#type = :type', {
    ':type': 'recruiter_agent_run',
  }, { '#type': 'type' });
  const now = Date.now();
  return rows
    .filter((run) => ['queued', 'running'].includes(run.status) && (!run.lockedUntil || new Date(run.lockedUntil).getTime() < now))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

export async function setRecruiterRunStatus(tenantId: string, runId: string, status: RecruiterRunStatus) {
  return updateRecruiterRun(tenantId, runId, {
    status,
    ...(status === 'completed' || status === 'cancelled' || status === 'failed'
      ? { completedAt: new Date().toISOString() }
      : {}),
  });
}

export async function setRecruiterRunVisibility(
  tenantId: string,
  userId: string,
  runId: string,
  visibility: 'private' | 'public'
) {
  const run = await getRecruiterRun(tenantId, runId);
  if (!run || run.userId !== userId) return null;
  return updateRecruiterRun(tenantId, run.id, { visibility });
}
