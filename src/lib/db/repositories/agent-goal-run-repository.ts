/**
 * Goal-agent multi-step runs — private or public within a tenant.
 *
 * Keys (profiles table):
 *   goal-run#${tenantId}#${runId}
 *   goal-index#${tenantId}#${userId}
 *   goal-public#${tenantId}
 *
 * @serverOnly
 */

import { getItem, putItem, tableNames } from '../dynamodb';
import type {
  AgentArtifact,
  AgentRunSnapshot,
  AgentRunStatus,
  AgentRunVisibility,
  AgentStep,
} from '@/lib/ai/agent-run-types';

function indexKey(tenantId: string, userId: string): string {
  return `goal-index#${tenantId}#${userId}`;
}

function publicIndexKey(tenantId: string): string {
  return `goal-public#${tenantId}`;
}

function runKey(tenantId: string, runId: string): string {
  return `goal-run#${tenantId}#${runId}`;
}

export function normalizeVisibility(v?: string | null): AgentRunVisibility {
  return v === 'public' ? 'public' : 'private';
}

export function canViewGoalRun(
  run: Pick<AgentRunSnapshot, 'userId' | 'visibility'>,
  userId: string
): boolean {
  if (run.userId && run.userId === userId) return true;
  return normalizeVisibility(run.visibility) === 'public';
}

export function canManageGoalRun(
  run: Pick<AgentRunSnapshot, 'userId'>,
  userId: string
): boolean {
  return !!run.userId && run.userId === userId;
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
    type: 'goal_run_index',
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
    type: 'goal_run_public_index',
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
  await putItem(tableNames.profiles, {
    id: key,
    tenant_id: tenantId,
    type: 'goal_run_public_index',
    ids: existing.ids.filter((x) => x !== runId),
    updatedAt: new Date().toISOString(),
  } satisfies IdIndex);
}

type StoredGoalRun = AgentRunSnapshot & {
  tenant_id: string;
  type: 'goal_run';
};

function slimForServer(run: AgentRunSnapshot): AgentRunSnapshot {
  return {
    ...run,
    goal: String(run.goal || '').slice(0, 2000),
    lastAssistantText: run.lastAssistantText
      ? String(run.lastAssistantText).slice(0, 6000)
      : undefined,
    error: run.error ? String(run.error).slice(0, 500) : undefined,
    visibility: normalizeVisibility(run.visibility),
    messages: (run.messages || []).slice(-40).map((m) => ({
      role: m.role,
      content: String(m.content || '').slice(0, 6000),
    })),
    steps: (run.steps || []).slice(-40).map((s: AgentStep) => ({
      ...s,
      detail: s.detail ? String(s.detail).slice(0, 500) : undefined,
      toolsUsed: s.toolsUsed?.slice(0, 20),
    })),
    artifacts: (run.artifacts || []).slice(-80).map((a: AgentArtifact) => ({
      ...a,
      title: String(a.title || '').slice(0, 300),
      subtitle: a.subtitle ? String(a.subtitle).slice(0, 300) : undefined,
      meta: a.meta
        ? {
            tool: a.meta.tool,
            id: a.meta.id,
            status: a.meta.status,
          }
        : undefined,
    })),
  };
}

/** Create or update a goal run (owner only for updates). */
export async function upsertGoalRun(
  tenantId: string,
  userId: string,
  run: AgentRunSnapshot,
  ownerLabel?: string
): Promise<AgentRunSnapshot> {
  const existing = await getGoalRun(tenantId, run.id);
  if (existing && existing.userId && existing.userId !== userId) {
    throw new Error('Only the run owner can update this goal run');
  }

  const now = new Date().toISOString();
  const visibility = normalizeVisibility(run.visibility);
  const slim = slimForServer({
    ...run,
    visibility,
    userId,
    ownerLabel: ownerLabel || run.ownerLabel,
    isOwner: true,
    persisted: true,
    updatedAt: now,
    createdAt: existing?.createdAt || run.createdAt || now,
  });

  // Pause mid-flight status for storage
  const status: AgentRunStatus =
    slim.status === 'running' || slim.status === 'planning'
      ? 'paused'
      : slim.status;

  const stored: StoredGoalRun = {
    ...slim,
    status,
    tenant_id: tenantId,
    type: 'goal_run',
    userId,
  };

  await putItem(tableNames.profiles, {
    id: runKey(tenantId, slim.id),
    ...stored,
  });

  if (!existing) {
    await addToIndex(tenantId, userId, slim.id);
  }
  if (visibility === 'public') {
    await addToPublicIndex(tenantId, slim.id);
  } else {
    await removeFromPublicIndex(tenantId, slim.id);
  }

  return {
    ...stored,
    id: slim.id,
    persisted: true,
    isOwner: true,
  };
}

export async function getGoalRun(
  tenantId: string,
  runId: string
): Promise<AgentRunSnapshot | null> {
  const short = runId.includes('#')
    ? runId.split('#').pop() || runId
    : runId;
  try {
    const item = await getItem<StoredGoalRun>(tableNames.profiles, {
      id: runKey(tenantId, short),
    });
    if (!item || item.type !== 'goal_run') return null;
    return {
      ...item,
      id: short,
      visibility: normalizeVisibility(item.visibility),
      persisted: true,
    };
  } catch {
    return null;
  }
}

export async function listGoalRunsForUser(
  tenantId: string,
  userId: string
): Promise<AgentRunSnapshot[]> {
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

  const runs: AgentRunSnapshot[] = [];
  for (const rid of idOrder.slice(0, 30)) {
    const r = await getGoalRun(tenantId, rid);
    if (!r) continue;
    if (!canViewGoalRun(r, userId)) continue;
    runs.push({
      ...r,
      isOwner: r.userId === userId,
      persisted: true,
    });
  }
  runs.sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  return runs;
}

export async function setGoalRunVisibility(
  tenantId: string,
  userId: string,
  runId: string,
  visibility: AgentRunVisibility
): Promise<AgentRunSnapshot | null> {
  const run = await getGoalRun(tenantId, runId);
  if (!run || !canManageGoalRun(run, userId)) return null;
  return upsertGoalRun(tenantId, userId, {
    ...run,
    visibility: normalizeVisibility(visibility),
  });
}
