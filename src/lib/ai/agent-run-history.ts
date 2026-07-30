/**
 * Persist Agent Desk runs in localStorage so leaving/returning restores progress.
 * @clientSafe
 */

import type { AgentRunSnapshot } from '@/lib/ai/agent-run-types';

const STORAGE_PREFIX = 'trio-agent-runs-v1';
const MAX_RUNS = 25;
const MAX_MESSAGES = 40;
const MAX_ARTIFACTS = 80;
const MAX_STEPS = 40;
const MAX_MSG_CHARS = 6_000;

function storageKey(userId?: string | null): string {
  return `${STORAGE_PREFIX}:${(userId || 'anon').trim() || 'anon'}`;
}

function slimRun(run: AgentRunSnapshot): AgentRunSnapshot {
  return {
    ...run,
    goal: String(run.goal || '').slice(0, 2_000),
    lastAssistantText: run.lastAssistantText
      ? String(run.lastAssistantText).slice(0, MAX_MSG_CHARS)
      : undefined,
    error: run.error ? String(run.error).slice(0, 500) : undefined,
    visibility: run.visibility === 'public' ? 'public' : 'private',
    messages: (run.messages || [])
      .slice(-MAX_MESSAGES)
      .map((m) => ({
        role: m.role,
        content: String(m.content || '').slice(0, MAX_MSG_CHARS),
      })),
    steps: (run.steps || []).slice(-MAX_STEPS).map((s) => ({
      ...s,
      detail: s.detail ? String(s.detail).slice(0, 500) : undefined,
      toolsUsed: s.toolsUsed?.slice(0, 20),
    })),
    artifacts: (run.artifacts || []).slice(-MAX_ARTIFACTS).map((a) => ({
      ...a,
      // Drop huge raw Apollo payloads from storage
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

function readAll(userId?: string | null): AgentRunSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AgentRunSnapshot[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && r.id && r.goal)
      .map((r) => slimRun(r))
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  } catch {
    return [];
  }
}

function writeAll(runs: AgentRunSnapshot[], userId?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = runs
      .map(slimRun)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      .slice(0, MAX_RUNS);
    localStorage.setItem(storageKey(userId), JSON.stringify(trimmed));
  } catch (err) {
    try {
      const half = runs
        .map(slimRun)
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
        .slice(0, Math.floor(MAX_RUNS / 2));
      localStorage.setItem(storageKey(userId), JSON.stringify(half));
    } catch {
      console.warn('[agent-run-history] write failed', err);
    }
  }
}

export function listAgentRuns(userId?: string | null): AgentRunSnapshot[] {
  return readAll(userId);
}

export function getAgentRun(
  runId: string,
  userId?: string | null
): AgentRunSnapshot | null {
  return readAll(userId).find((r) => r.id === runId) || null;
}

export function getActiveAgentRun(
  userId?: string | null
): AgentRunSnapshot | null {
  const all = readAll(userId);
  return (
    all.find((r) =>
      ['running', 'paused', 'awaiting_approval', 'planning'].includes(r.status)
    ) ||
    all[0] ||
    null
  );
}

/** Upsert run; mark non-terminal status as paused if page was left mid-flight */
export function saveAgentRun(
  run: AgentRunSnapshot,
  userId?: string | null
): void {
  const toSave: AgentRunSnapshot = {
    ...slimRun(run),
    // Don't leave "running" stuck forever if tab closed
    status:
      run.status === 'running' || run.status === 'planning'
        ? 'paused'
        : run.status,
    updatedAt: new Date().toISOString(),
  };
  const all = readAll(userId).filter((r) => r.id !== toSave.id);
  all.unshift(toSave);
  writeAll(all, userId);
}

export function deleteAgentRun(
  runId: string,
  userId?: string | null
): void {
  writeAll(
    readAll(userId).filter((r) => r.id !== runId),
    userId
  );
}

export function clearAgentRuns(userId?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* ignore */
  }
}

export function formatRunWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const time = d.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round(
      (startToday.getTime() - startMsg.getTime()) / 86400000
    );
    if (diffDays === 0) return `Today, ${time}`;
    if (diffDays === 1) return `Yesterday, ${time}`;
    const date = d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    return `${date}, ${time}`;
  } catch {
    return '';
  }
}
