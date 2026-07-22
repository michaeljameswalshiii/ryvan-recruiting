'use client';

/**
 * Premium right-pane agent launcher + live job queue for Company List Builder.
 * Results open on a dedicated page — this pane stays focused and calm.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Loader2,
  Pause,
  Play,
  X,
  Sparkles,
  Upload,
  ArrowUpRight,
  Radio,
  CheckCircle2,
  Clock3,
  CircleDashed,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
// toast used for launch / control feedback

export type ListBuilderJobDto = {
  id: string;
  status: string;
  brief: string;
  geography: string;
  targetSize: number;
  progress: {
    found: number;
    target: number;
    batchesCompleted: number;
    lastMessage?: string;
    researched?: number;
    completeFound?: number;
    partialFound?: number;
    emptyBatchStreak?: number;
    errorStreak?: number;
  };
  results?: unknown[];
  expiresAt?: string;
  createdAt?: string;
};

const ACTIVE = new Set(['queued', 'running', 'paused']);
const DONE = new Set(['awaiting_import', 'completed']);

function statusMeta(status: string): {
  label: string;
  className: string;
  Icon: typeof Radio;
} {
  switch (status) {
    case 'running':
    case 'queued':
      return {
        label: status === 'queued' ? 'Queued' : 'Running',
        className: 'bg-sky-500/15 text-sky-700 ring-sky-500/20',
        Icon: Radio,
      };
    case 'paused':
      return {
        label: 'Paused',
        className: 'bg-amber-500/15 text-amber-800 ring-amber-500/25',
        Icon: Pause,
      };
    case 'awaiting_import':
    case 'completed':
      return {
        label: status === 'completed' ? 'Imported' : 'Ready',
        className: 'bg-emerald-500/15 text-emerald-800 ring-emerald-500/25',
        Icon: CheckCircle2,
      };
    case 'cancelled':
    case 'failed':
      return {
        label: status === 'failed' ? 'Failed' : 'Cancelled',
        className: 'bg-rose-500/10 text-rose-700 ring-rose-500/20',
        Icon: X,
      };
    default:
      return {
        label: status,
        className: 'bg-slate-500/10 text-slate-600 ring-slate-500/15',
        Icon: CircleDashed,
      };
  }
}

type Props = {
  /** compact = floating drawer strip */
  variant?: 'full' | 'compact';
};

export function AgentWorkbench({ variant = 'full' }: Props) {
  const [jobs, setJobs] = useState<ListBuilderJobDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [brief, setBrief] = useState('');
  const [geography, setGeography] = useState('United States');
  const [targetSize, setTargetSize] = useState(50);
  const [seedCsv, setSeedCsv] = useState('');
  const [showCsv, setShowCsv] = useState(false);

  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const tickingRef = useRef(false);

  const load = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch('/api/list-builder', {
        credentials: 'include',
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.jobs)) setJobs(data.jobs);
    } catch {
      /* quiet */
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Stable poll/tick loop — must NOT restart when `jobs` changes (that
  // previously reset the counter and prevented ticks after the first batch).
  useEffect(() => {
    let cancelled = false;

    const tickActive = async () => {
      if (tickingRef.current || cancelled) return;
      const runnable = jobsRef.current.find(
        (x) => x.status === 'running' || x.status === 'queued'
      );
      if (!runnable) return;
      tickingRef.current = true;
      try {
        await fetch(`/api/list-builder/${runnable.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'tick' }),
        });
        if (!cancelled) await load();
      } catch {
        /* quiet */
      } finally {
        tickingRef.current = false;
      }
    };

    const t = setInterval(() => {
      const hasActive = jobsRef.current.some((j) => ACTIVE.has(j.status));
      if (!hasActive) return;
      void load();
      void tickActive();
    }, 15_000);

    // Kick soon after mount if something is already running
    const kick = setTimeout(() => {
      if (jobsRef.current.some((j) => j.status === 'running' || j.status === 'queued')) {
        void tickActive();
      }
    }, 3_000);

    return () => {
      cancelled = true;
      clearInterval(t);
      clearTimeout(kick);
    };
  }, [load]);

  const action = async (jobId: string, act: string) => {
    setBusyId(jobId);
    try {
      const res = await fetch(`/api/list-builder/${jobId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: act }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data.error || 'Action failed');
      else await load();
    } finally {
      setBusyId(null);
    }
  };

  const startJob = async () => {
    if (!brief.trim() && !seedCsv.trim()) {
      toast.error('Describe who you want to reach, or paste a CSV seed list');
      return;
    }
    setBusyId('new');
    try {
      const res = await fetch('/api/list-builder', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: brief.trim() || 'Seed list enrichment',
          geography: geography.trim() || 'United States',
          targetSize,
          seedCsv: seedCsv.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not start agent');
      } else {
        toast.success('Agent launched — keep working, we’ll notify when ready');
        setBrief('');
        setSeedCsv('');
        setShowCsv(false);
        await load();
      }
    } finally {
      setBusyId(null);
    }
  };

  const isCompact = variant === 'compact';

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${
        isCompact
          ? 'rounded-2xl border border-white/10 bg-slate-950 text-white shadow-xl'
          : 'bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white'
      }`}
    >
      {/* Hero header */}
      <div className={`shrink-0 border-b border-white/10 ${isCompact ? 'px-3 py-3' : 'px-5 py-5'}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-200 ring-1 ring-violet-400/30">
              <Sparkles className="h-3 w-3" />
              Autonomous agent
            </div>
            <h2
              className={`mt-2 font-semibold tracking-tight text-white ${
                isCompact ? 'text-sm' : 'text-lg'
              }`}
            >
              Company List Builder
            </h2>
            {!isCompact && (
              <p className="mt-1 text-sm leading-relaxed text-slate-400">
                Describe a market. We keep companies with a public{' '}
                <span className="text-slate-200">email or phone</span>
                {' '}(both preferred), while you keep chatting on the left.
              </p>
            )}
          </div>
        </div>

        {/* Launch form */}
        <div className={`mt-4 space-y-2.5 ${isCompact ? 'mt-3' : ''}`}>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={isCompact ? 2 : 3}
            className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none ring-violet-500/0 transition focus:border-violet-400/40 focus:bg-white/[0.07] focus:ring-2 focus:ring-violet-500/30"
            placeholder="e.g. Construction companies in Palm Beach County under 300 employees — HR or owners…"
          />
          <div className={`grid gap-2 ${isCompact ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Geography
              </label>
              <input
                value={geography}
                onChange={(e) => setGeography(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none focus:border-violet-400/40"
                placeholder="United States"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Target companies
              </label>
              <input
                type="number"
                min={1}
                max={200}
                value={targetSize}
                onChange={(e) => setTargetSize(Number(e.target.value) || 50)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-sm text-white outline-none focus:border-violet-400/40"
              />
            </div>
          </div>
          {!isCompact && (
            <button
              type="button"
              onClick={() => setShowCsv((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-violet-200"
            >
              <Upload className="h-3.5 w-3.5" />
              {showCsv ? 'Hide CSV seed' : 'Optional: paste CSV seed list'}
            </button>
          )}
          {showCsv && !isCompact && (
            <textarea
              value={seedCsv}
              onChange={(e) => setSeedCsv(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 font-mono text-[11px] text-slate-300 outline-none"
              placeholder={
                'company,website,city,contact,email,phone\nAcme Inc,acme.com,Miami,,,'
              }
            />
          )}
          <Button
            type="button"
            disabled={busyId === 'new'}
            onClick={() => void startJob()}
            className="h-11 w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 hover:from-violet-500 hover:to-indigo-500"
          >
            {busyId === 'new' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Launching…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Launch agent
              </>
            )}
          </Button>
          <p className="text-center text-[10px] text-slate-500">
            Keeps email or phone (both preferred) · up to 2 hours · pause anytime
          </p>
        </div>
      </div>

      {/* Queue */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Active & recent
          </span>
          <button
            type="button"
            onClick={() => void load()}
            className="text-[10px] text-slate-500 hover:text-slate-300"
          >
            Refresh
          </button>
        </div>

        {loading && jobs.length === 0 ? (
          <div className="flex items-center gap-2 px-2 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading agents…
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-center">
            <Clock3 className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 text-sm font-medium text-slate-300">No agents yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Launch one above — it runs while you work.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {jobs.map((j) => {
              const meta = statusMeta(j.status);
              const Icon = meta.Icon;
              const found = j.progress?.found ?? 0;
              const target = j.targetSize || j.progress?.target || 1;
              const researched = j.progress?.researched || 0;
              const completeFound = j.progress?.completeFound ?? 0;
              const partialFound =
                j.progress?.partialFound ??
                Math.max(0, found - completeFound);
              // Progress bar: prefer kept/target; if still 0 kept, show research activity
              const keepPct = Math.min(100, Math.round((found / target) * 100));
              const researchHintPct =
                found === 0 && researched > 0
                  ? Math.min(35, Math.round((researched / Math.max(target * 2, 1)) * 100) + 4)
                  : 0;
              const pct = Math.max(keepPct, researchHintPct);
              const emptyStreak = j.progress?.emptyBatchStreak || 0;
              const isActive = ACTIVE.has(j.status);
              const isDone = DONE.has(j.status);

              return (
                <li
                  key={j.id}
                  className="group rounded-2xl border border-white/10 bg-white/[0.04] p-3 shadow-sm transition hover:border-violet-400/30 hover:bg-white/[0.06]"
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1 ${meta.className}`}
                    >
                      {j.status === 'running' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                        <span className="text-[10px] font-medium text-slate-300">
                          {found} kept · {researched} researched · target {target}
                        </span>
                      </div>
                      {(completeFound > 0 || partialFound > 0) && (
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {completeFound} complete
                          {partialFound > 0 ? ` · ${partialFound} partial` : ''}
                        </p>
                      )}
                      <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-slate-100">
                        {j.brief || 'List job'}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">
                        {j.geography}
                        {emptyStreak > 0 && isActive
                          ? ` · empty streak ${emptyStreak}/8`
                          : ''}
                        {j.progress?.lastMessage
                          ? ` · ${j.progress.lastMessage}`
                          : ''}
                      </p>
                      {isActive && (
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-sky-400 transition-all duration-500"
                            style={{ width: `${Math.max(pct, 4)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {(j.status === 'running' || j.status === 'queued') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 rounded-lg px-2 text-[11px] text-slate-300 hover:bg-white/10 hover:text-white"
                        disabled={busyId === j.id}
                        onClick={() => void action(j.id, 'pause')}
                      >
                        <Pause className="mr-1 h-3 w-3" /> Pause
                      </Button>
                    )}
                    {j.status === 'paused' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 rounded-lg px-2 text-[11px] text-slate-300 hover:bg-white/10 hover:text-white"
                        disabled={busyId === j.id}
                        onClick={() => void action(j.id, 'resume')}
                      >
                        <Play className="mr-1 h-3 w-3" /> Resume
                      </Button>
                    )}
                    {isActive && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 rounded-lg px-2 text-[11px] text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                        disabled={busyId === j.id}
                        onClick={() => void action(j.id, 'cancel')}
                      >
                        <X className="mr-1 h-3 w-3" /> Cancel
                      </Button>
                    )}
                    {(isDone || found > 0 || j.status === 'cancelled') && (
                      <Link
                        href={`/dashboard/list-builder/${j.id}`}
                        className="ml-auto inline-flex h-7 items-center gap-1 rounded-lg bg-white px-2.5 text-[11px] font-semibold text-slate-900 shadow-sm transition hover:bg-violet-100"
                      >
                        View results
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
