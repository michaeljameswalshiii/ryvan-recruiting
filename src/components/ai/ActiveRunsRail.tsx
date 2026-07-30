'use client';

/**
 * Right-rail “Active runs” for the unified AI home.
 * Surfaces list-builder (companies) jobs + goal-agent history so users can
 * resume work without hunting for Agent Desk.
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

export type AiWorkspace = 'companies' | 'fill' | 'goal';

type Props = {
  /** Open a workspace from the rail */
  onOpenWorkspace: (ws: AiWorkspace) => void;
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
  if (status === 'failed' || status === 'cancelled')
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

export function ActiveRunsRail({ onOpenWorkspace, className = '' }: Props) {
  const [jobs, setJobs] = useState<ListJob[]>([]);
  const [goals, setGoals] = useState<AgentRunSnapshot[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadGoals = useCallback((uid: string | null) => {
    setGoals(listAgentRuns(uid).slice(0, 12));
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
      loadGoals(uid);
      await loadJobs();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadGoals, loadJobs]);

  // Poll list-builder while any job is active
  useEffect(() => {
    const hasActive = jobs.some((j) => ACTIVE_JOB.has(j.status));
    if (!hasActive && !loading) {
      // Still refresh goals occasionally when user returns from workspace
      const t = window.setInterval(() => loadGoals(userId), 12_000);
      return () => window.clearInterval(t);
    }
    const t = window.setInterval(() => {
      void loadJobs();
      loadGoals(userId);
    }, 6_000);
    return () => window.clearInterval(t);
  }, [jobs, loading, userId, loadJobs, loadGoals]);

  const refresh = async () => {
    setRefreshing(true);
    await loadJobs();
    loadGoals(userId);
    setRefreshing(false);
  };

  const activeJobs = jobs.filter((j) => ACTIVE_JOB.has(j.status));
  const recentJobs = jobs
    .filter((j) => !ACTIVE_JOB.has(j.status))
    .slice(0, 4);
  const activeGoals = goals.filter((g) => ACTIVE_GOAL.has(g.status));
  const recentGoals = goals
    .filter((g) => !ACTIVE_GOAL.has(g.status))
    .slice(0, 4);

  const totalActive = activeJobs.length + activeGoals.length;

  return (
    <aside
      className={`flex w-full shrink-0 flex-col border-l border-slate-200/80 bg-white lg:w-72 xl:w-80 ${className}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Active runs</h2>
          <p className="text-[11px] text-slate-500">
            {totalActive > 0
              ? `${totalActive} in progress`
              : 'Company lists & goal agents'}
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

            {/* Fill job shortcut */}
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
                  Open
                </button>
              </div>
              <button
                type="button"
                onClick={() => onOpenWorkspace('fill')}
                className="flex w-full items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 text-left transition hover:border-violet-200 hover:bg-violet-50/40"
              >
                <Briefcase className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="text-xs text-slate-700">
                  Source candidates via Apollo
                </span>
              </button>
            </section>

            {/* Goal agent */}
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
                  Multi-step CRM goal agent
                </button>
              ) : (
                <ul className="space-y-1.5">
                  {[...activeGoals, ...recentGoals].map((g) => (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => onOpenWorkspace('goal')}
                        className="w-full rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-left transition hover:border-violet-200 hover:bg-violet-50/40"
                      >
                        <div className="flex items-start gap-2">
                          <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
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
