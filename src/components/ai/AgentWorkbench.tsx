'use client';

/**
 * Premium right-pane agent launcher + live job queue.
 * Modes: Companies (web list-builder) | Candidates (People Data Labs).
 * Results open on dedicated pages — this pane stays focused and calm.
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
  Building2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export type AgentMode = 'companies' | 'candidates';

export type AgentJobDto = {
  id: string;
  status: string;
  brief: string;
  geography: string;
  targetSize: number;
  visibility?: 'private' | 'public';
  userId?: string;
  isOwner?: boolean;
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
    estimatedCostUsd?: number;
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

function apiBase(mode: AgentMode): string {
  return mode === 'candidates'
    ? '/api/candidate-list-builder'
    : '/api/list-builder';
}

function resultsPath(mode: AgentMode, id: string): string {
  return mode === 'candidates'
    ? `/dashboard/candidate-list-builder/${id}`
    : `/dashboard/list-builder/${id}`;
}

type Props = {
  variant?: 'full' | 'compact';
  /** Default agent mode */
  defaultMode?: AgentMode;
};

export function AgentWorkbench({
  variant = 'full',
  defaultMode = 'companies',
}: Props) {
  const [mode, setMode] = useState<AgentMode>(defaultMode);
  const [jobs, setJobs] = useState<AgentJobDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [brief, setBrief] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [seedCsv, setSeedCsv] = useState('');
  const [showCsv, setShowCsv] = useState(false);
  const [pdlConfigured, setPdlConfigured] = useState<boolean | null>(null);

  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const tickingRef = useRef(false);

  const load = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    const m = modeRef.current;
    try {
      const res = await fetch(apiBase(m), {
        credentials: 'include',
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (modeRef.current !== m) return; // stale response after mode switch
      if (res.ok && Array.isArray(data.jobs)) setJobs(data.jobs);
      if (m === 'candidates' && typeof data.pdlConfigured === 'boolean') {
        setPdlConfigured(data.pdlConfigured);
      }
    } catch {
      /* quiet */
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setJobs([]);
    void load();
  }, [load, mode]);

  // Stable poll/tick loop — restarts on mode change only
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
        await fetch(`${apiBase(modeRef.current)}/${runnable.id}`, {
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

    const kick = setTimeout(() => {
      if (
        jobsRef.current.some(
          (j) => j.status === 'running' || j.status === 'queued'
        )
      ) {
        void tickActive();
      }
    }, 3_000);

    return () => {
      cancelled = true;
      clearInterval(t);
      clearTimeout(kick);
    };
  }, [load, mode]);

  const action = async (
    jobId: string,
    act: string,
    extra?: Record<string, unknown>
  ) => {
    setBusyId(jobId);
    try {
      const res = await fetch(`${apiBase(mode)}/${jobId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: act, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data.error || 'Action failed');
      else {
        if (act === 'set_visibility') {
          toast.success(
            extra?.visibility === 'public'
              ? 'List is now public to your team'
              : 'List is now private'
          );
        }
        await load();
      }
    } finally {
      setBusyId(null);
    }
  };

  const startJob = async () => {
    if (mode === 'companies' && !brief.trim() && !seedCsv.trim()) {
      toast.error('Describe who you want to reach, or paste a CSV seed list');
      return;
    }
    if (mode === 'candidates' && !brief.trim()) {
      toast.error('Describe the candidates you want to source');
      return;
    }
    if (mode === 'candidates' && pdlConfigured === false) {
      toast.error(
        'People Data Labs is not configured. Add PEOPLE_DATA_LABS_API_KEY in env.'
      );
      return;
    }

    setBusyId('new');
    try {
      const body: Record<string, unknown> = {
        brief:
          brief.trim() ||
          (mode === 'companies' ? 'Seed list enrichment' : ''),
        visibility,
      };
      if (mode === 'companies' && seedCsv.trim()) {
        body.seedCsv = seedCsv.trim();
      }

      const res = await fetch(apiBase(mode), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Could not start agent');
      } else {
        toast.success(
          visibility === 'public'
            ? 'Agent launched — list is public to your team'
            : 'Agent launched — keep working, we’ll notify when ready'
        );
        setBrief('');
        setSeedCsv('');
        setShowCsv(false);
        setVisibility('private');
        await load();
      }
    } finally {
      setBusyId(null);
    }
  };

  const isCompact = variant === 'full' ? false : true;
  const isCandidates = mode === 'candidates';

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${
        isCompact
          ? 'rounded-2xl border border-white/10 bg-slate-950 text-white shadow-xl'
          : 'bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white'
      }`}
    >
      {/* Hero header */}
      <div
        className={`shrink-0 border-b border-white/10 ${
          isCompact ? 'px-3 py-3' : 'px-5 py-5'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-200 ring-1 ring-violet-400/30">
              <Sparkles className="h-3 w-3" />
              Autonomous agent
            </div>
            <h2
              className={`mt-2 font-semibold tracking-tight text-white ${
                isCompact ? 'text-sm' : 'text-lg'
              }`}
            >
              {isCandidates ? 'Candidate Search Agent' : 'Company List Builder'}
            </h2>
            {!isCompact && (
              <p className="mt-1 text-sm leading-relaxed text-slate-400">
                {isCandidates ? (
                  <>
                    Describe a role and market. People Data Labs (AWS Data
                    Exchange) pages through matching people — spend shows on{' '}
                    <span className="text-slate-200">Usage</span>. Import into
                    Trio candidates when ready.
                  </>
                ) : (
                  <>
                    Describe a market. Grok on Bedrock browses company sites and
                    keeps rows with a public{' '}
                    <span className="text-slate-200">email or phone</span> (both
                    preferred), while you keep chatting on the left.
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Mode toggle */}
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            onClick={() => setMode('companies')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition ${
              mode === 'companies'
                ? 'bg-violet-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            Companies
          </button>
          <button
            type="button"
            onClick={() => setMode('candidates')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition ${
              mode === 'candidates'
                ? 'bg-violet-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Candidates
          </button>
        </div>

        {isCandidates && pdlConfigured === false && (
          <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-100">
            PDL key missing. Set{' '}
            <code className="text-amber-50">PEOPLE_DATA_LABS_API_KEY</code> (or{' '}
            <code className="text-amber-50">PDL_API_KEY</code>) from AWS Data
            Exchange / PDL, then redeploy.
          </p>
        )}

        {/* Launch form */}
        <div className={`mt-4 space-y-2.5 ${isCompact ? 'mt-3' : ''}`}>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={isCompact ? 2 : 3}
            className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none ring-violet-500/0 transition focus:border-violet-400/40 focus:bg-white/[0.07] focus:ring-2 focus:ring-violet-500/30"
            placeholder={
              isCandidates
                ? 'e.g. 50 Finance Implementation Specialists in Florida with NetSuite…'
                : 'e.g. Construction companies in Palm Beach County under 300 employees — HR or owners…'
            }
          />
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Sharing
            </label>
            <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setVisibility('private')}
                className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${
                  visibility === 'private'
                    ? 'bg-violet-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Private
              </button>
              <button
                type="button"
                onClick={() => setVisibility('public')}
                className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${
                  visibility === 'public'
                    ? 'bg-violet-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Public
              </button>
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              {visibility === 'public'
                ? 'Any teammate on your tenant can view and import this list.'
                : 'Only you can see this list.'}
            </p>
          </div>
          {!isCompact && !isCandidates && (
            <button
              type="button"
              onClick={() => setShowCsv((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-violet-200"
            >
              <Upload className="h-3.5 w-3.5" />
              {showCsv ? 'Hide CSV seed' : 'Optional: paste CSV seed list'}
            </button>
          )}
          {showCsv && !isCompact && !isCandidates && (
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
                Launch {isCandidates ? 'candidate' : 'company'} agent
              </>
            )}
          </Button>
          <p className="text-center text-[10px] text-slate-500">
            {isCandidates
              ? 'Loops PDL person search until target · spend on Usage · pause anytime'
              : 'Runs until target usable leads (email or phone) · up to 2 hours · pause anytime'}
          </p>
        </div>
      </div>

      {/* Queue */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {isCandidates ? 'Candidate agents' : 'Active & recent'}
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
            <p className="mt-3 text-sm font-medium text-slate-300">
              No agents yet
            </p>
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
              const keepPct = Math.min(100, Math.round((found / target) * 100));
              const researchHintPct =
                found === 0 && researched > 0
                  ? Math.min(
                      35,
                      Math.round((researched / Math.max(target * 2, 1)) * 100) +
                        4
                    )
                  : 0;
              const pct = Math.max(keepPct, researchHintPct);
              const emptyStreak = j.progress?.emptyBatchStreak || 0;
              const isActive = ACTIVE.has(j.status);
              const isDone = DONE.has(j.status);
              const cost = j.progress?.estimatedCostUsd;

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
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                            j.visibility === 'public'
                              ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/25'
                              : 'bg-slate-500/15 text-slate-400 ring-slate-500/20'
                          }`}
                        >
                          {j.visibility === 'public' ? 'Public' : 'Private'}
                          {j.isOwner === false ? ' · team' : ''}
                        </span>
                        <span className="text-[10px] font-medium text-slate-300">
                          {found} kept
                          {researched > 0 ? ` · ${researched} scanned` : ''} ·
                          target {target}
                          {typeof cost === 'number' && cost > 0
                            ? ` · ~$${cost.toFixed(2)}`
                            : ''}
                        </span>
                      </div>
                      {(completeFound > 0 || partialFound > 0) && (
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {completeFound} complete
                          {partialFound > 0
                            ? ` · ${partialFound} partial`
                            : ''}
                        </p>
                      )}
                      <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-slate-100">
                        {j.brief || 'Agent job'}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">
                        {j.geography}
                        {emptyStreak > 0 && isActive && found < target
                          ? ` · still hunting (${emptyStreak} quiet batches)`
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
                    {j.isOwner !== false &&
                      (j.status === 'running' || j.status === 'queued') && (
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
                    {j.isOwner !== false && j.status === 'paused' && (
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
                    {j.isOwner !== false && isActive && (
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
                    {j.isOwner !== false && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 rounded-lg px-2 text-[11px] text-slate-400 hover:bg-white/10 hover:text-white"
                        disabled={busyId === j.id}
                        onClick={() =>
                          void action(j.id, 'set_visibility', {
                            visibility:
                              j.visibility === 'public' ? 'private' : 'public',
                          })
                        }
                        title="Toggle private / public sharing with your team"
                      >
                        {j.visibility === 'public'
                          ? 'Make private'
                          : 'Share public'}
                      </Button>
                    )}
                    {(isDone || found > 0 || j.status === 'cancelled') && (
                      <Link
                        href={resultsPath(mode, j.id)}
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

/** @deprecated alias — prefer AgentJobDto */
export type ListBuilderJobDto = AgentJobDto;
