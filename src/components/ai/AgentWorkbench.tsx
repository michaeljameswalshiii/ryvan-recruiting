'use client';

/**
 * Premium right-pane agent launcher + live job queue.
 * Modes:
 *  - Companies (web list-builder for BD)
 *  - Fill job (careers URL / brief → people via Apollo/PDL/LLM)
 * The free-text PDL “Candidates” list-builder is intentionally omitted —
 * Fill job covers req-driven sourcing without a separate PDL-only mode.
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
  Target,
  ExternalLink,
  Mail,
  Linkedin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export type AgentMode = 'companies' | 'research';

type SourcedPerson = {
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
};

type ApolloSearchPlanDto = {
  titles?: string[];
  personLocations?: string[];
  keywords?: string[];
  seniorities?: string[];
  rationale?: string;
  query?: string;
};

type ResearchRun = {
  id: string;
  query: string;
  at: string;
  count: number;
  estimatedCostUsd: number;
  jobTitle?: string;
  jobLocation?: string;
  notes?: string[];
  candidates: SourcedPerson[];
  error?: string;
  usageLine?: string;
  /** LLM-built Apollo filters used for this run */
  apolloPlan?: ApolloSearchPlanDto;
  apolloPlanSource?: 'llm' | 'heuristic';
  usageBreakdown?: {
    llm?: {
      inputTokens: number;
      outputTokens: number;
      estimatedUsd: number;
      modelId?: string;
    };
    apollo?: {
      results: number;
      credits: number;
      estimatedUsd: number;
      note?: string;
    };
    totalEstimatedUsd: number;
  };
};

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

function apiBase(_mode: AgentMode): string {
  return '/api/list-builder';
}

function resultsPath(_mode: AgentMode, id: string): string {
  return `/dashboard/list-builder/${id}`;
}

/**
 * LinkedIn people search deep link.
 * Long "name + full title + company" keyword strings often return 0 hits.
 * Prefer quoted name (+ short company); never dump the full job title.
 */
function linkedInPeopleSearchUrl(person: {
  name?: string;
  title?: string;
  company?: string;
}): string {
  const name = (person.name || '').trim();
  if (!name) {
    return 'https://www.linkedin.com/search/results/people/';
  }
  const company = (person.company || '')
    .replace(/\b(inc\.?|llc|ltd|corp\.?|co\.)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
  const keywords = company ? `"${name}" ${company}` : `"${name}"`;
  const params = new URLSearchParams({
    keywords,
    origin: 'GLOBAL_SEARCH_HEADER',
  });
  return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
}

function googlePersonSearchUrl(person: {
  name?: string;
  title?: string;
  company?: string;
}): string {
  const name = (person.name || '').trim();
  const company = (person.company || '').trim();
  const q = [`"${name}"`, company, 'LinkedIn'].filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
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
  const [mode, setMode] = useState<AgentMode>(
    defaultMode === 'research' ? 'research' : 'companies'
  );
  const [jobs, setJobs] = useState<AgentJobDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [brief, setBrief] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [seedCsv, setSeedCsv] = useState('');
  const [showCsv, setShowCsv] = useState(false);
  const [sourceConfigured, setSourceConfigured] = useState<boolean | null>(
    null
  );
  const [sourceEngines, setSourceEngines] = useState<{
    apollo?: boolean;
    apolloKeyPresent?: boolean;
    pdl?: boolean;
    agentcoreWeb?: boolean;
    llm?: boolean;
  }>({});
  const [apolloStatus, setApolloStatus] = useState<{
    keySource?: string;
    tenantHasKey?: boolean;
    tenantKeyHint?: string;
    probeOk?: boolean;
    probeError?: string;
    probePeople?: number;
  } | null>(null);
  const [researchRuns, setResearchRuns] = useState<ResearchRun[]>([]);
  const [researching, setResearching] = useState(false);
  /** Fill-job location: '' = use job default; 'any' = worldwide; else override */
  const [fillLocation, setFillLocation] = useState('');
  const [fillLocationMode, setFillLocationMode] = useState<
    'job' | 'any' | 'custom'
  >('job');

  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const tickingRef = useRef(false);

  const load = useCallback(async () => {
    if (modeRef.current === 'research') {
      setLoading(false);
      return;
    }
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
      if (modeRef.current === 'research') return;
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

  // Sourcing engines status when Research (fill-job) mode is active
  useEffect(() => {
    if (mode !== 'research') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/agent/source-candidates', {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setSourceConfigured(!!data.configured);
        setSourceEngines(data.engines || {});
        if (data.apollo) {
          setApolloStatus({
            keySource: data.apollo.keySource,
            tenantHasKey: data.apollo.tenantHasKey,
            tenantKeyHint: data.apollo.tenantKeyHint,
            probeOk: data.apollo.probe?.ok,
            probeError: data.apollo.probe?.error,
            probePeople: data.apollo.probe?.people,
          });
        }
      } catch {
        if (!cancelled) setSourceConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const startResearch = async () => {
    if (!brief.trim()) {
      toast.error(
        'Paste a careers job URL or describe the role (title + location + skills)'
      );
      return;
    }
    // Always allowed — LLM path works without Apollo/PDL
    setResearching(true);
    setBusyId('research');
    try {
      const locationPayload =
        fillLocationMode === 'any'
          ? ''
          : fillLocationMode === 'custom' && fillLocation.trim()
            ? fillLocation.trim()
            : undefined; // job default

      const res = await fetch('/api/agent/source-candidates', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: brief.trim(),
          limit: 15,
          ...(locationPayload !== undefined
            ? { location: locationPayload }
            : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      const cost =
        typeof data.estimatedToolCostUsd === 'number'
          ? data.estimatedToolCostUsd
          : typeof data.estimatedCostUsd === 'number'
            ? data.estimatedCostUsd
            : 0;
      const people: SourcedPerson[] = Array.isArray(data.candidates)
        ? data.candidates
        : [];
      const run: ResearchRun = {
        id: `r-${Date.now()}`,
        query: brief.trim(),
        at: new Date().toISOString(),
        count: people.length || Number(data.count) || 0,
        estimatedCostUsd: cost,
        jobTitle: data.job?.title,
        jobLocation: data.job?.location,
        notes: Array.isArray(data.notes) ? data.notes : [],
        candidates: people,
        error:
          res.ok && people.length
            ? undefined
            : data.error || 'No candidates found',
        usageLine:
          typeof data.usageLine === 'string' ? data.usageLine : undefined,
        usageBreakdown: data.usageBreakdown || undefined,
        apolloPlan:
          data.apolloPlan && typeof data.apolloPlan === 'object'
            ? data.apolloPlan
            : undefined,
        apolloPlanSource:
          data.apolloPlanSource === 'llm' ||
          data.apolloPlanSource === 'heuristic'
            ? data.apolloPlanSource
            : undefined,
      };
      setResearchRuns((prev) => [run, ...prev].slice(0, 12));
      if (!res.ok || !people.length) {
        const authHint =
          data.apolloHttpStatus === 401 || data.apolloHttpStatus === 403
            ? ` (Apollo ${data.apolloHttpStatus}, key=${data.apolloKeySource || '?'})`
            : data.apolloKeySource
              ? ` (Apollo key=${data.apolloKeySource})`
              : '';
        toast.error(
          (data.error || 'No candidates found for this role') + authHint
        );
      } else {
        toast.success(
          run.usageLine ||
            `Found ${run.count} candidate(s) for ${data.job?.title || 'this role'} · ~$${cost.toFixed(4)}`
        );
      }
    } catch {
      toast.error('Candidate sourcing failed');
    } finally {
      setResearching(false);
      setBusyId(null);
    }
  };

  const startJob = async () => {
    if (mode === 'research') {
      await startResearch();
      return;
    }
    if (!brief.trim() && !seedCsv.trim()) {
      toast.error('Describe who you want to reach, or paste a CSV seed list');
      return;
    }

    setBusyId('new');
    try {
      const body: Record<string, unknown> = {
        brief: brief.trim() || 'Seed list enrichment',
        visibility,
      };
      if (seedCsv.trim()) {
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
  const isResearch = mode === 'research';
  const researchSpend = researchRuns.reduce(
    (s, r) => s + (r.estimatedCostUsd || 0),
    0
  );

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
              {isResearch
                ? 'Source candidates for a job'
                : 'Company List Builder'}
            </h2>
            {!isCompact && (
              <p className="mt-1 text-sm leading-relaxed text-slate-400">
                {isResearch ? (
                  <>
                    Paste a{' '}
                    <span className="text-slate-200">careers job URL</span> or
                    role brief. We read the req, then find{' '}
                    <span className="text-slate-200">real people</span> via
                    Apollo/PDL when available, otherwise{' '}
                    <span className="text-slate-200">
                      LLM + Nova web grounding
                    </span>
                    . Cost logs on Usage.
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

        {/* Mode toggle — Companies (BD) | Fill job (candidates for a req) */}
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
            onClick={() => setMode('research')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition ${
              mode === 'research'
                ? 'bg-sky-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Target className="h-3.5 w-3.5" />
            Fill job
          </button>
        </div>

        {isResearch && apolloStatus?.probeOk === false && (
          <p className="mt-2 rounded-lg border border-rose-500/35 bg-rose-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-rose-100">
            <strong className="text-rose-50">Apollo key not working.</strong>{' '}
            {apolloStatus.probeError ||
              'People Search returned an auth error.'}{' '}
            Key source: <code className="text-rose-50">{apolloStatus.keySource || '—'}</code>
            {apolloStatus.tenantHasKey
              ? ` · company key ${apolloStatus.tenantKeyHint || 'saved'}`
              : ' · no company key saved'}
            . Open <strong className="text-rose-50">Settings → Integrations</strong> and
            re-save a <strong className="text-rose-50">master</strong> Apollo API key
            with People API Search. The LLM plan is fine — without a valid key Apollo
            returns 0 people.
          </p>
        )}

        {isResearch && apolloStatus?.probeOk && (
          <p className="mt-2 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2.5 py-2 text-[11px] text-sky-100">
            Apollo OK · key={apolloStatus.keySource}
            {typeof apolloStatus.probePeople === 'number'
              ? ` · probe ${apolloStatus.probePeople} people`
              : ''}
            {' · '}
            {[
              sourceEngines.pdl && 'PDL',
              sourceEngines.agentcoreWeb && 'Web hints',
            ]
              .filter(Boolean)
              .join(' · ') || 'ready'}
            {' · '}session ~${researchSpend.toFixed(4)}
          </p>
        )}

        {isResearch && sourceConfigured === false && !apolloStatus && (
          <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-100">
            No people database ready. Add a{' '}
            <strong className="text-amber-50">company Apollo key</strong> in
            Settings (or enable PDL) so we can find candidates for the posting.
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
              isResearch
                ? 'Careers job URL or full JD — LLM builds Apollo filters (titles/location/keywords), then finds real people'
                : 'e.g. Construction companies in Palm Beach County under 300 employees — HR or owners…'
            }
          />
          {isResearch && (
            <div className="space-y-1.5">
              <label className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Location (optional)
              </label>
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
                {(
                  [
                    { id: 'job' as const, label: 'From job' },
                    { id: 'any' as const, label: 'Anywhere' },
                    { id: 'custom' as const, label: 'Custom' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFillLocationMode(opt.id)}
                    className={`rounded-md px-1.5 py-1.5 text-[11px] font-medium transition ${
                      fillLocationMode === opt.id
                        ? 'bg-sky-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {fillLocationMode === 'custom' && (
                <input
                  type="text"
                  value={fillLocation}
                  onChange={(e) => setFillLocation(e.target.value)}
                  placeholder="e.g. Miami, FL · Remote · Texas"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none focus:border-sky-400/40"
                />
              )}
              <p className="text-[10px] text-slate-500">
                {fillLocationMode === 'job'
                  ? 'Uses the job’s location when available.'
                  : fillLocationMode === 'any'
                    ? 'No location filter — broader search.'
                    : 'Apollo person location filter for this run only.'}
              </p>
            </div>
          )}
          {!isResearch && (
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
          )}
          {!isCompact && !isResearch && (
            <button
              type="button"
              onClick={() => setShowCsv((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-violet-200"
            >
              <Upload className="h-3.5 w-3.5" />
              {showCsv ? 'Hide CSV seed' : 'Optional: paste CSV seed list'}
            </button>
          )}
          {showCsv && !isCompact && !isResearch && (
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
            disabled={busyId === 'new' || researching}
            onClick={() => void startJob()}
            className={`h-11 w-full rounded-xl text-sm font-semibold text-white shadow-lg ${
              isResearch
                ? 'bg-gradient-to-r from-sky-600 to-cyan-600 shadow-sky-900/40 hover:from-sky-500 hover:to-cyan-500'
                : 'bg-gradient-to-r from-violet-600 to-indigo-600 shadow-violet-900/40 hover:from-violet-500 hover:to-indigo-500'
            }`}
          >
            {busyId === 'new' || researching ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isResearch ? 'Finding candidates…' : 'Launching…'}
              </>
            ) : (
              <>
                {isResearch ? (
                  <Target className="mr-2 h-4 w-4" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {isResearch
                  ? 'Find candidates for this job'
                  : 'Launch company agent'}
              </>
            )}
          </Button>
          <p className="text-center text-[10px] text-slate-500">
            {isResearch
              ? 'Reads the job → Apollo/PDL or LLM people discovery · cost on Usage'
              : 'Runs until target usable leads (email or phone) · up to 2 hours · pause anytime'}
          </p>
        </div>
      </div>

      {/* Queue / research results */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {isResearch ? (
          <>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Candidate matches
              </span>
              <span className="text-[10px] text-slate-500">
                Session ~${researchSpend.toFixed(4)}
              </span>
            </div>
            {researchRuns.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-center">
                <Target className="mx-auto h-8 w-8 text-slate-600" />
                <p className="mt-3 text-sm font-medium text-slate-300">
                  No sourcing runs yet
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Paste a job from Careers (or a role brief) to find people who
                  fit the posting.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {researchRuns.map((run) => {
                  const hasLlmOnly =
                    run.candidates.length > 0 &&
                    run.candidates.every(
                      (c) => c.source === 'llm' || c.source === 'web'
                    );
                  return (
                  <li
                    key={run.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="font-medium text-slate-200 line-clamp-1">
                        {run.jobTitle || run.query}
                      </span>
                      {run.jobLocation && (
                        <span className="text-slate-500">{run.jobLocation}</span>
                      )}
                      <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-200 ring-1 ring-sky-500/25">
                        {run.count} people
                      </span>
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-200 ring-1 ring-emerald-500/20">
                        ~${run.estimatedCostUsd.toFixed(4)}
                      </span>
                    </div>
                    {run.apolloPlan && (
                      <div className="mt-2 rounded-lg border border-violet-500/20 bg-violet-500/10 px-2.5 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-200">
                          Apollo search plan
                          {run.apolloPlanSource
                            ? ` · ${run.apolloPlanSource}`
                            : ''}
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-200">
                          {(run.apolloPlan.titles || []).length > 0 && (
                            <>
                              <span className="text-slate-400">Titles: </span>
                              {(run.apolloPlan.titles || [])
                                .slice(0, 4)
                                .join('; ')}
                              <br />
                            </>
                          )}
                          <span className="text-slate-400">Location: </span>
                          {(run.apolloPlan.personLocations || []).length
                            ? (run.apolloPlan.personLocations || []).join('; ')
                            : 'anywhere'}
                          {(run.apolloPlan.keywords || []).length > 0 && (
                            <>
                              <br />
                              <span className="text-slate-400">Keywords: </span>
                              {(run.apolloPlan.keywords || [])
                                .slice(0, 6)
                                .join(', ')}
                            </>
                          )}
                          {(run.apolloPlan.seniorities || []).length > 0 && (
                            <>
                              <br />
                              <span className="text-slate-400">Seniority: </span>
                              {(run.apolloPlan.seniorities || []).join(', ')}
                            </>
                          )}
                          {run.apolloPlan.rationale && (
                            <>
                              <br />
                              <span className="text-slate-400">Why: </span>
                              {run.apolloPlan.rationale}
                            </>
                          )}
                        </p>
                      </div>
                    )}
                    {run.usageBreakdown && (
                      <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        <div className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-300">
                            LLM
                          </p>
                          {run.usageBreakdown.llm ? (
                            <p className="mt-0.5 text-[11px] text-slate-200">
                              {(run.usageBreakdown.llm.inputTokens || 0) +
                                (run.usageBreakdown.llm.outputTokens || 0)}{' '}
                              tokens
                              <span className="text-slate-500">
                                {' '}
                                ({run.usageBreakdown.llm.inputTokens || 0} in /{' '}
                                {run.usageBreakdown.llm.outputTokens || 0} out)
                              </span>
                              <br />
                              <span className="font-medium text-emerald-200">
                                $
                                {run.usageBreakdown.llm.estimatedUsd.toFixed(4)}
                              </span>
                            </p>
                          ) : (
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              No LLM calls this run
                            </p>
                          )}
                        </div>
                        <div className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-300">
                            Apollo
                          </p>
                          {run.usageBreakdown.apollo ? (
                            <p className="mt-0.5 text-[11px] text-slate-200">
                              {run.usageBreakdown.apollo.results} results ·{' '}
                              {run.usageBreakdown.apollo.credits} credits
                              <br />
                              <span className="font-medium text-emerald-200">
                                $
                                {run.usageBreakdown.apollo.estimatedUsd.toFixed(
                                  4
                                )}
                              </span>
                              {run.usageBreakdown.apollo.note && (
                                <span className="block text-[10px] text-slate-500">
                                  {run.usageBreakdown.apollo.note}
                                </span>
                              )}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              No Apollo search this run
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    {hasLlmOnly && (
                      <p className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-[10px] leading-relaxed text-amber-100/90">
                        <strong className="text-amber-50">LLM leads ≠ open-to-work.</strong>{' '}
                        These are role-fit suggestions (or web-extracted names),
                        not people confirmed as job seekers. Verify on LinkedIn
                        before outreach. For emails/phones and live employment
                        data, fix the{' '}
                        <span className="text-amber-50">company Apollo key</span>{' '}
                        in Settings.
                      </p>
                    )}
                    {run.error && (
                      <p className="mt-1.5 text-[11px] text-rose-300">
                        {run.error}
                      </p>
                    )}
                    {run.notes && run.notes.length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {run.notes.slice(0, 8).map((n, ni) => (
                          <p
                            key={ni}
                            className={`text-[10px] leading-snug ${
                              /AUTH|401|403|Invalid|not configured/i.test(n)
                                ? 'text-rose-300'
                                : 'text-slate-500'
                            }`}
                          >
                            {n}
                          </p>
                        ))}
                      </div>
                    )}
                    <ul className="mt-2 space-y-2">
                      {run.candidates.slice(0, 12).map((c, i) => {
                        const liSearch = linkedInPeopleSearchUrl(c);
                        const googleSearch = googlePersonSearchUrl(c);
                        const isLlm = c.source === 'llm' || c.source === 'web';
                        return (
                        <li
                          key={`${run.id}-${c.id || i}`}
                          className="rounded-lg border border-white/5 bg-black/20 px-2.5 py-2"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="text-xs font-medium text-white">
                                {c.name}
                              </p>
                              {c.source && (
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${
                                    c.source === 'apollo' || c.source === 'pdl'
                                      ? 'bg-emerald-500/20 text-emerald-200'
                                      : 'bg-amber-500/20 text-amber-100'
                                  }`}
                                  title={
                                    c.source === 'apollo' || c.source === 'pdl'
                                      ? 'From people database'
                                      : 'LLM / web discovery — verify before outreach'
                                  }
                                >
                                  {c.source === 'llm'
                                    ? 'LLM · verify'
                                    : c.source}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-400">
                              {[c.title, c.company, c.location]
                                .filter(Boolean)
                                .join(' · ')}
                              {typeof c.qualityScore === 'number' && (
                                <span className="ml-1.5 text-slate-500">
                                  · Q{c.qualityScore}
                                </span>
                              )}
                            </p>
                            {c.snippet && (
                              <p className="mt-1 text-[10px] text-slate-500 line-clamp-2">
                                {c.snippet}
                              </p>
                            )}
                            <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1 text-[11px]">
                              {c.email && (
                                <a
                                  href={`mailto:${c.email}`}
                                  className="inline-flex items-center gap-1 text-sky-300 hover:underline"
                                >
                                  <Mail className="h-3 w-3" />
                                  {c.email}
                                </a>
                              )}
                              {/* LLM/web /in/ URLs often 404 — only trust direct profile from Apollo/PDL */}
                              {c.linkedinUrl && !isLlm ? (
                                <a
                                  href={c.linkedinUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-sky-300 hover:underline"
                                >
                                  <Linkedin className="h-3 w-3" />
                                  Profile
                                </a>
                              ) : (
                                <a
                                  href={liSearch}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-sky-300 hover:underline"
                                >
                                  <Linkedin className="h-3 w-3" />
                                  Find on LinkedIn
                                </a>
                              )}
                              <a
                                href={googleSearch}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-slate-400 hover:text-sky-300 hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Google
                              </a>
                              {c.url && !c.linkedinUrl && (
                                <a
                                  href={c.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-slate-400 hover:text-sky-300 hover:underline"
                                >
                                  Source
                                </a>
                              )}
                              {isLlm && (
                                <span className="text-[10px] text-slate-500">
                                  Not confirmed open to work
                                </span>
                              )}
                            </div>
                          </div>
                        </li>
                        );
                      })}
                    </ul>
                  </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}

/** @deprecated alias — prefer AgentJobDto */
export type ListBuilderJobDto = AgentJobDto;
