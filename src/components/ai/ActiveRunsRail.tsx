'use client';

/**
 * Right-rail “Active runs” for the unified AI home.
 * Surfaces company list-builder jobs, fill-job Apollo runs, and goal-agent
 * history (local + server) so users can resume work without hunting for Desk.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bot,
  Building2,
  Briefcase,
  Loader2,
  Radio,
  RefreshCw,
} from 'lucide-react';
import {
  formatRunWhen,
  listAgentRuns,
} from '@/lib/ai/agent-run-history';
import type { AgentRunSnapshot } from '@/lib/ai/agent-run-types';

type ListJob = {
  id: string;
  status: string;
  brief: string;
  progress?: {
    found?: number;
    target?: number;
    lastMessage?: string;
  };
  createdAt?: string;
  updatedAt?: string;
};

type FillRunSummary = {
  id: string;
  query: string;
  jobTitle?: string;
  jobLocation?: string;
  count: number;
  visibility?: 'private' | 'public' | string;
  isOwner?: boolean;
  ownerLabel?: string;
  createdAt?: string;
  updatedAt?: string;
  error?: string;
};

export type AiWorkspace = 'companies' | 'fill' | 'goal';

export type OpenWorkspaceOpts = {
  /** Open a specific fill-job or goal run when entering the workspace */
  runId?: string;
};

type Props = {
  /** Open a workspace from the rail */
  onOpenWorkspace: (ws: AiWorkspace, opts?: OpenWorkspaceOpts) => void;
  /** Optional class on the aside */
  className?: string;
};

const ACTIVE_JOB = new Set(['queued', 'running', 'paused']);
const ACTIVE_GOAL = new Set([
  'running',
  'paused',
  'awaiting_approval',
  'planning',
]);

function jobStatusClass(status: string) {
  if (status === 'running' || status === 'queued')
    return 'bg-sky-100 text-sky-800 border-sky-200';
  if (status === 'paused') return 'bg-amber-100 text-amber-900 border-amber-200';
  if (status === 'completed' || status === 'awaiting_import')
    return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === 'failed' || status === 'cancelled' || status === 'rejected')
    return 'bg-rose-100 text-rose-800 border-rose-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
}

function goalStatusClass(status: AgentRunSnapshot['status']) {
  switch (status) {
    case 'running':
    case 'planning':
      return 'bg-sky-100 text-sky-800 border-sky-200';
    case 'awaiting_approval':
      return 'bg-amber-100 text-amber-900 border-amber-200';
    case 'completed':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'failed':
    case 'cancelled':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    case 'paused':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

function mergeGoalRuns(
  local: AgentRunSnapshot[],
  remote: AgentRunSnapshot[]
): AgentRunSnapshot[] {
  const byId = new Map<string, AgentRunSnapshot>();
  for (const r of remote) byId.set(r.id, r);
  for (const r of local) {
    const existing = byId.get(r.id);
    if (!existing) {
      byId.set(r.id, r);
      continue;
    }
    if (
      new Date(r.updatedAt).getTime() > new Date(existing.updatedAt).getTime()
    ) {
      byId.set(r.id, {
        ...r,
        visibility: r.visibility || existing.visibility,
        persisted: r.persisted || existing.persisted,
        isOwner: r.isOwner ?? existing.isOwner,
        ownerLabel: r.ownerLabel || existing.ownerLabel,
      });
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function ActiveRunsRail({ onOpenWorkspace, className = '' }: Props) {
  const [jobs, setJobs] = useState<ListJob[]>([]);
  const [fillRuns, setFillRuns] = useState<FillRunSummary[]>([]);
  const [goals, setGoals] = useState<AgentRunSnapshot[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadGoals = useCallback(async (uid: string | null) => {
    const local = listAgentRuns(uid);
    try {
      const res = await fetch('/api/agent/goal-runs', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const remote = Array.isArray(data?.runs)
          ? (data.runs as AgentRunSnapshot[])
          : [];
        setGoals(mergeGoalRuns(local, remote).slice(0, 12));
        return;
      }
    } catch {
      /* local only */
    }
    setGoals(local.slice(0, 12));
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/list-builder', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data?.jobs) ? (data.jobs as ListJob[]) : [];
      setJobs(list.slice(0, 20));
    } catch {
      /* ignore */
    }
  }, []);

  const loadFillRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/fill-runs', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data?.runs) ? data.runs : [];
      const mapped: FillRunSummary[] = list.map(
        (r: Record<string, unknown>) => ({
          id: String(r.id),
          query: String(r.query || ''),
          jobTitle: typeof r.jobTitle === 'string' ? r.jobTitle : undefined,
          jobLocation:
            typeof r.jobLocation === 'string' ? r.jobLocation : undefined,
          count: Number(r.count) || 0,
          visibility:
            r.visibility === 'public' ? 'public' : 'private',
          isOwner: r.isOwner === true,
          ownerLabel:
            typeof r.ownerLabel === 'string' ? r.ownerLabel : undefined,
          createdAt:
            typeof r.createdAt === 'string' ? r.createdAt : undefined,
          updatedAt:
            typeof r.updatedAt === 'string' ? r.updatedAt : undefined,
          error: typeof r.error === 'string' ? r.error : undefined,
        })
      );
      setFillRuns(
        mapped
          .sort(
            (a, b) =>
              new Date(b.updatedAt || b.createdAt || 0).getTime() -
              new Date(a.updatedAt || a.createdAt || 0).getTime()
          )
          .slice(0, 12)
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let uid: string | null = null;
      try {
        const res = await fetch('/api/auth/session', {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        uid =
          data?.user?.id ||
          data?.userId ||
          data?.user?.userId ||
          data?.session?.userId ||
          null;
        if (uid) uid = String(uid);
      } catch {
        /* anon */
      }
      if (cancelled) return;
      setUserId(uid);
      await Promise.all([
        loadGoals(uid),
        loadJobs(),
        loadFillRuns(),
      ]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadGoals, loadJobs, loadFillRuns]);

  // Poll while company jobs or goal agents are active
  useEffect(() => {
    const hasActive =
      jobs.some((j) => ACTIVE_JOB.has(j.status)) ||
      goals.some((g) => ACTIVE_GOAL.has(g.status));
    if (!hasActive && !loading) {
      const t = window.setInterval(() => {
        void loadGoals(userId);
        void loadFillRuns();
      }, 12_000);
      return () => window.clearInterval(t);
    }
    const t = window.setInterval(() => {
      void loadJobs();
      void loadGoals(userId);
      void loadFillRuns();
    }, 6_000);
    return () => window.clearInterval(t);
  }, [jobs, goals, loading, userId, loadJobs, loadGoals, loadFillRuns]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadJobs(),
      loadGoals(userId),
      loadFillRuns(),
    ]);
    setRefreshing(false);
  };

  const activeJobs = jobs.filter((j) => ACTIVE_JOB.has(j.status));
  const recentJobs = jobs
    .filter((j) => !ACTIVE_JOB.has(j.status))
    .slice(0, 4);
  const recentFills = fillRuns.slice(0, 6);
  const activeGoals = goals.filter((g) => ACTIVE_GOAL.has(g.status));
  const recentGoals = goals
    .filter((g) => !ACTIVE_GOAL.has(g.status))
    .slice(0, 4);

  const totalActive = activeJobs.length + activeGoals.length;

  return (
    <aside
      className={`flex h-full w-full min-w-0 shrink-0 flex-col border-l border-slate-200/80 bg-white ${className || 'xl:w-72 2xl:w-80'}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Active runs</h2>
          <p className="text-[11px] text-slate-500">
            {totalActive > 0
              ? `${totalActive} in progress`
              : 'Companies, fill jobs & goals'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          title="Refresh"
          disabled={refreshing}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            {/* Company list builder */}
            <section>
              <div className="mb-1.5 flex items-center justify-between px-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Find companies
                </p>
                <button
                  type="button"
                  onClick={() => onOpenWorkspace('companies')}
                  className="text-[10px] font-medium text-violet-700 hover:underline"
                >
                  New
                </button>
              </div>
              {activeJobs.length === 0 && recentJobs.length === 0 ? (
                <button
                  type="button"
                  onClick={() => onOpenWorkspace('companies')}
                  className="w-full rounded-xl border border-dashed border-slate-200 px-3 py-4 text-left text-xs text-slate-500 transition hover:border-violet-300 hover:bg-violet-50/50 hover:text-slate-700"
                >
                  <Building2 className="mb-1 h-4 w-4 text-slate-400" />
                  Start a company list run
                </button>
              ) : (
                <ul className="space-y-1.5">
                  {[...activeJobs, ...recentJobs].map((j) => (
                    <li key={j.id}>
                      <Link
                        href={`/dashboard/list-builder/${j.id}`}
                        className="block rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 transition hover:border-violet-200 hover:bg-violet-50/40"
                      >
                        <div className="flex items-start gap-2">
                          {ACTIVE_JOB.has(j.status) ? (
                            <Radio className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 animate-pulse" />
                          ) : (
                            <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-slate-900">
                              {j.brief || 'Company list'}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span
                                className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold capitalize ${jobStatusClass(j.status)}`}
                              >
                                {j.status.replace(/_/g, ' ')}
                              </span>
                              {typeof j.progress?.found === 'number' && (
                                <span className="text-[10px] text-slate-500">
                                  {j.progress.found}
                                  {j.progress.target
                                    ? `/${j.progress.target}`
                                    : ''}{' '}
                                  found
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      onClick={() => onOpenWorkspace('companies')}
                      className="w-full rounded-lg px-2 py-1.5 text-left text-[11px] font-medium text-violet-700 hover:bg-violet-50"
                    >
                      Open list builder →
                    </button>
                  </li>
                </ul>
              )}
            </section>

            {/* Fill job history (same pattern as companies) */}
            <section>
              <div className="mb-1.5 flex items-center justify-between px-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Fill a job
                </p>
                <button
                  type="button"
                  onClick={() => onOpenWorkspace('fill')}
                  className="text-[10px] font-medium text-violet-700 hover:underline"
                >
                  New
                </button>
              </div>
              {recentFills.length === 0 ? (
                <button
                  type="button"
                  onClick={() => onOpenWorkspace('fill')}
                  className="w-full rounded-xl border border-dashed border-slate-200 px-3 py-4 text-left text-xs text-slate-500 transition hover:border-violet-300 hover:bg-violet-50/50 hover:text-slate-700"
                >
                  <Briefcase className="mb-1 h-4 w-4 text-slate-400" />
                  Source candidates via Apollo
                </button>
              ) : (
                <ul className="space-y-1.5">
                  {recentFills.map((f) => {
                    const when = formatRunWhen(
                      f.updatedAt || f.createdAt || ''
                    );
                    return (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() =>
                            onOpenWorkspace('fill', { runId: f.id })
                          }
                          className="w-full rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-left transition hover:border-violet-200 hover:bg-violet-50/40"
                        >
                          <div className="flex items-start gap-2">
                            <Briefcase className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-2 text-xs font-medium text-slate-900">
                                {f.jobTitle || f.query || 'Fill job run'}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
                                    f.error
                                      ? 'bg-rose-100 text-rose-800 border-rose-200'
                                      : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                  }`}
                                >
                                  {f.error
                                    ? 'Failed'
                                    : `${f.count} people`}
                                </span>
                                {f.visibility === 'public' && (
                                  <span className="rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">
                                    Public
                                    {!f.isOwner && f.ownerLabel
                                      ? ` · ${f.ownerLabel}`
                                      : ''}
                                  </span>
                                )}
                                {when && (
                                  <span className="text-[10px] text-slate-400">
                                    {when}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                  <li>
                    <button
                      type="button"
                      onClick={() => onOpenWorkspace('fill')}
                      className="w-full rounded-lg px-2 py-1.5 text-left text-[11px] font-medium text-violet-700 hover:bg-violet-50"
                    >
                      Open fill job →
                    </button>
                  </li>
                </ul>
              )}
            </section>

            {/* Goal agent history */}
            <section>
              <div className="mb-1.5 flex items-center justify-between px-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  CRM goals
                </p>
                <button
                  type="button"
                  onClick={() => onOpenWorkspace('goal')}
                  className="text-[10px] font-medium text-violet-700 hover:underline"
                >
                  New
                </button>
              </div>
              {activeGoals.length === 0 && recentGoals.length === 0 ? (
                <button
                  type="button"
                  onClick={() => onOpenWorkspace('goal')}
                  className="w-full rounded-xl border border-dashed border-slate-200 px-3 py-4 text-left text-xs text-slate-500 transition hover:border-violet-300 hover:bg-violet-50/50 hover:text-slate-700"
                >
                  <Bot className="mb-1 h-4 w-4 text-slate-400" />
                  Custom CRM tasks (named companies, research)
                </button>
              ) : (
                <ul className="space-y-1.5">
                  {[...activeGoals, ...recentGoals].map((g) => (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() =>
                          onOpenWorkspace('goal', { runId: g.id })
                        }
                        className="w-full rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-left transition hover:border-violet-200 hover:bg-violet-50/40"
                      >
                        <div className="flex items-start gap-2">
                          {ACTIVE_GOAL.has(g.status) ? (
                            <Radio className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 animate-pulse" />
                          ) : (
                            <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-xs font-medium text-slate-900">
                              {g.goal}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span
                                className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold capitalize ${goalStatusClass(g.status)}`}
                              >
                                {g.status.replace(/_/g, ' ')}
                              </span>
                              {g.visibility === 'public' && (
                                <span className="rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">
                                  Public
                                  {g.isOwner === false && g.ownerLabel
                                    ? ` · ${g.ownerLabel}`
                                    : ''}
                                </span>
                              )}
                              {g.wave > 0 && (
                                <span className="text-[10px] text-slate-500">
                                  wave {g.wave}
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400">
                                {formatRunWhen(g.updatedAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      onClick={() => onOpenWorkspace('goal')}
                      className="w-full rounded-lg px-2 py-1.5 text-left text-[11px] font-medium text-violet-700 hover:bg-violet-50"
                    >
                      Open custom task →
                    </button>
                  </li>
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </aside>
  );
}

export default ActiveRunsRail;
