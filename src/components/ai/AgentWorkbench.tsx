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
  History,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { INDUSTRY_PLAYS } from '@/lib/sourcing/industry-plays';

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
  /** 0–100 fit vs JD after re-rank */
  fitScore?: number;
  fitReason?: string;
  mustHaveHit?: boolean;
  geoOk?: boolean;
};

function fitBadgeClass(score: number): string {
  if (score >= 85) return 'bg-emerald-500/25 text-emerald-100 ring-emerald-400/40';
  if (score >= 70) return 'bg-sky-500/20 text-sky-100 ring-sky-400/35';
  if (score >= 50) return 'bg-amber-500/20 text-amber-100 ring-amber-400/30';
  return 'bg-slate-500/20 text-slate-300 ring-slate-400/25';
}

type ApolloSearchPlanDto = {
  titles?: string[];
  personLocations?: string[];
  mustHaveKeywords?: string[];
  keywords?: string[];
  seniorities?: string[];
  rationale?: string;
  query?: string;
};

/** Editable Apollo plan draft (UI string fields → arrays on submit) */
type PlanDraft = {
  titles: string;
  locations: string;
  mustHave: string;
  keywords: string;
  seniorities: string;
};

const emptyPlanDraft = (): PlanDraft => ({
  titles: '',
  locations: '',
  mustHave: '',
  keywords: '',
  seniorities: '',
});

function planToDraft(p?: ApolloSearchPlanDto | null): PlanDraft {
  if (!p) return emptyPlanDraft();
  return {
    titles: (p.titles || []).join('; '),
    locations: (p.personLocations || []).join('; '),
    mustHave: (p.mustHaveKeywords || []).join(', '),
    keywords: (p.keywords || []).join(', '),
    seniorities: (p.seniorities || []).join(', '),
  };
}

function draftToPlan(d: PlanDraft): ApolloSearchPlanDto {
  const split = (s: string, re: RegExp) =>
    (s || '')
      .split(re)
      .map((x) => x.trim())
      .filter(Boolean);
  return {
    titles: split(d.titles, /[;\n]+/),
    personLocations: split(d.locations, /[;\n]+/),
    mustHaveKeywords: split(d.mustHave, /[,\n]+/),
    keywords: split(d.keywords, /[,\n]+/),
    seniorities: split(d.seniorities, /[,\n]+/),
    rationale: 'User-edited Apollo plan',
  };
}

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
  apolloPlanSource?: 'llm' | 'heuristic' | 'user';
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
  /** Persisted sharing — private only you; public = whole tenant */
  visibility?: 'private' | 'public';
  isOwner?: boolean;
  ownerLabel?: string;
  /** Server-persisted (shareable) vs session-only */
  persisted?: boolean;
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
/** Apollo masks last names as Me*** — never put asterisks into search URLs. */
function cleanSearchName(name?: string): {
  queryName: string;
  isMasked: boolean;
} {
  const raw = (name || '').trim();
  const isMasked = /\*{2,}/.test(raw);
  // Strip * and collapse spaces: "Toby Me***" → "Toby Me"
  const stripped = raw
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped) return { queryName: '', isMasked };
  const parts = stripped.split(/\s+/).filter(Boolean);
  if (isMasked) {
    // First name only is more reliable than partial last (Me / Ha / Ep)
    return { queryName: parts[0] || stripped, isMasked: true };
  }
  return { queryName: stripped, isMasked: false };
}

/** "VP / Director of Ops · Plant Manager" → first usable title */
function cleanSearchTitle(title?: string): string {
  if (!title) return '';
  let t = title
    .split(/\s*\/\s*/)[0]
    .split(/\s*[·•|]\s*/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  // Drop trailing seniority clutter after em-dash style dual titles
  if (t.length > 55) t = t.slice(0, 55).replace(/\s+\S*$/, '');
  return t;
}

function cleanSearchCompany(company?: string): string {
  if (!company) return '';
  return company
    .replace(/\b(inc\.?|llc|ltd|corp\.?|co\.|plc)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
}

/**
 * Build a LinkedIn people search that works for Apollo privacy-masked names.
 * Prefer: first name + title + company (not "Toby Me***").
 */
function linkedInPeopleSearchUrl(person: {
  name?: string;
  title?: string;
  company?: string;
}): string {
  const { queryName, isMasked } = cleanSearchName(person.name);
  const title = cleanSearchTitle(person.title);
  const company = cleanSearchCompany(person.company);

  const parts: string[] = [];
  if (queryName) {
    // Quote full real names; don't quote single first names on masked rows
    parts.push(isMasked || !queryName.includes(' ') ? queryName : `"${queryName}"`);
  }
  if (title) parts.push(title);
  if (company) parts.push(company);

  const keywords = parts.join(' ').trim() || 'people';
  const params = new URLSearchParams({ keywords });
  return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
}

function googlePersonSearchUrl(person: {
  name?: string;
  title?: string;
  company?: string;
}): string {
  const { queryName, isMasked } = cleanSearchName(person.name);
  const title = cleanSearchTitle(person.title);
  const company = cleanSearchCompany(person.company);

  const parts: string[] = [];
  if (queryName) {
    parts.push(isMasked || !queryName.includes(' ') ? queryName : `"${queryName}"`);
  }
  if (title) parts.push(`"${title}"`);
  if (company) parts.push(`"${company}"`);
  parts.push('site:linkedin.com/in OR LinkedIn');

  const q = parts.filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

type Props = {
  variant?: 'full' | 'compact';
  /** Default agent mode */
  defaultMode?: AgentMode;
  /**
   * Visual theme — light for Agent Desk embed; dark for legacy embeds.
   */
  theme?: 'dark' | 'light';
  /** Hide outer “Autonomous agent” chrome when nested in Agent Desk tabs */
  hideChrome?: boolean;
  /** Highlight / scroll to a persisted fill-job run (Active runs history) */
  focusFillRunId?: string;
  /** Controlled History drawer (Agent Desk header) */
  fillHistoryOpen?: boolean;
  onFillHistoryOpenChange?: (open: boolean) => void;
  /** Report saved fill-run count to parent (desk History badge) */
  onFillHistoryCountChange?: (count: number) => void;
};

function formatFillWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const time = d.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    const now = new Date();
    const startToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round(
      (startToday.getTime() - startMsg.getTime()) / 86400000
    );
    if (diffDays === 0) return `Today, ${time}`;
    if (diffDays === 1) return `Yesterday, ${time}`;
    return `${d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })}, ${time}`;
  } catch {
    return '';
  }
}

export function AgentWorkbench({
  variant = 'full',
  defaultMode = 'companies',
  theme = 'dark',
  hideChrome = false,
  focusFillRunId,
  fillHistoryOpen: fillHistoryOpenProp,
  onFillHistoryOpenChange,
  onFillHistoryCountChange,
}: Props) {
  const light = theme === 'light';
  const [mode, setMode] = useState<AgentMode>(
    defaultMode === 'research' ? 'research' : 'companies'
  );
  // Parent tabs (Agent Desk) control mode when hideChrome
  useEffect(() => {
    if (hideChrome) {
      setMode(defaultMode === 'research' ? 'research' : 'companies');
    }
  }, [defaultMode, hideChrome]);
  const [jobs, setJobs] = useState<AgentJobDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [brief, setBrief] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [seedCsv, setSeedCsv] = useState('');
  const [showCsv, setShowCsv] = useState(false);
  const [fillHistoryOpenLocal, setFillHistoryOpenLocal] = useState(false);
  const [fillHistoryLoading, setFillHistoryLoading] = useState(false);
  const fillHistoryOpen =
    typeof fillHistoryOpenProp === 'boolean'
      ? fillHistoryOpenProp
      : fillHistoryOpenLocal;
  const setFillHistoryOpen = useCallback(
    (open: boolean) => {
      setFillHistoryOpenLocal(open);
      onFillHistoryOpenChange?.(open);
    },
    [onFillHistoryOpenChange]
  );
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
  const [highlightedFillRunId, setHighlightedFillRunId] = useState<
    string | null
  >(null);
  const fillRunRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const [researching, setResearching] = useState(false);
  /** Editable Apollo filters — filled after first LLM plan; user can tweak & re-run */
  const [planDraft, setPlanDraft] = useState<PlanDraft>(emptyPlanDraft);
  const [planSourceLabel, setPlanSourceLabel] = useState<string | null>(null);
  /** Collapse plan after results so candidates (and links) stay clickable */
  const [planExpanded, setPlanExpanded] = useState(true);
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

  const mergeServerFillRuns = useCallback((mapped: ResearchRun[]) => {
    setResearchRuns((prev) => {
      // Keep any session-only runs (not yet persisted), then server runs
      const sessionOnly = prev.filter((p) => !p.persisted);
      const byId = new Map<string, ResearchRun>();
      for (const m of mapped) byId.set(m.id, m);
      for (const s of sessionOnly) {
        if (!byId.has(s.id)) byId.set(s.id, s);
      }
      return Array.from(byId.values())
        .sort(
          (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
        )
        .slice(0, 20);
    });
  }, []);

  const mapFillApiRun = useCallback(
    (r: Record<string, unknown>): ResearchRun => ({
      id: String(r.id),
      query: String(r.query || ''),
      at: String(r.createdAt || r.updatedAt || new Date().toISOString()),
      count: Number(r.count) || 0,
      estimatedCostUsd: Number(r.estimatedCostUsd) || 0,
      jobTitle: typeof r.jobTitle === 'string' ? r.jobTitle : undefined,
      jobLocation:
        typeof r.jobLocation === 'string' ? r.jobLocation : undefined,
      notes: Array.isArray(r.notes) ? r.notes.map(String) : [],
      candidates: Array.isArray(r.candidates)
        ? (r.candidates as SourcedPerson[])
        : [],
      error: typeof r.error === 'string' ? r.error : undefined,
      usageLine: typeof r.usageLine === 'string' ? r.usageLine : undefined,
      apolloPlan:
        r.apolloPlan && typeof r.apolloPlan === 'object'
          ? (r.apolloPlan as ApolloSearchPlanDto)
          : undefined,
      apolloPlanSource:
        r.apolloPlanSource as ResearchRun['apolloPlanSource'],
      visibility: r.visibility === 'public' ? 'public' : 'private',
      isOwner: r.isOwner === true,
      ownerLabel:
        typeof r.ownerLabel === 'string' ? r.ownerLabel : undefined,
      persisted: true,
    }),
    []
  );

  const loadFillHistory = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!opts?.quiet) setFillHistoryLoading(true);
      try {
        const res = await fetch('/api/agent/fill-runs', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data?.runs) ? data.runs : [];
        if (!list.length) {
          // Don't wipe session-only runs
          return;
        }
        mergeServerFillRuns(
          list.map((r: Record<string, unknown>) => mapFillApiRun(r))
        );
      } catch {
        /* ignore */
      } finally {
        if (!opts?.quiet) setFillHistoryLoading(false);
      }
    },
    [mapFillApiRun, mergeServerFillRuns]
  );

  // Load own + public fill-job runs for this tenant (team sharing)
  useEffect(() => {
    if (mode !== 'research') return;
    void loadFillHistory({ quiet: true });
  }, [mode, loadFillHistory]);

  // Keep desk header History badge in sync
  useEffect(() => {
    if (mode !== 'research') {
      onFillHistoryCountChange?.(0);
      return;
    }
    onFillHistoryCountChange?.(researchRuns.length);
  }, [mode, researchRuns.length, onFillHistoryCountChange]);

  // Parent opened History from desk header — refresh list
  useEffect(() => {
    if (mode === 'research' && fillHistoryOpen) {
      void loadFillHistory({ quiet: true });
    }
  }, [fillHistoryOpen, mode, loadFillHistory]);

  const openFillRunFromHistory = useCallback(
    (run: ResearchRun) => {
      setHighlightedFillRunId(run.id);
      if (run.apolloPlan) {
        setPlanDraft(planToDraft(run.apolloPlan));
        setPlanSourceLabel(run.apolloPlanSource || null);
        setPlanExpanded(false);
      }
      if (run.query) setBrief(run.query);
      if (run.visibility === 'public' || run.visibility === 'private') {
        setVisibility(run.visibility);
      }
      setFillHistoryOpen(false);
      // Ensure run is first in list for visibility
      setResearchRuns((prev) => {
        const rest = prev.filter((r) => r.id !== run.id);
        return [run, ...rest];
      });
      requestAnimationFrame(() => {
        fillRunRefs.current[run.id]?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      });
      toast.success(
        run.isOwner === false
          ? 'Opened shared team fill run'
          : 'Opened fill-job run from history'
      );
    },
    [setFillHistoryOpen]
  );

  // Focus a fill-job run opened from Active runs history
  useEffect(() => {
    if (mode !== 'research' || !focusFillRunId) {
      setHighlightedFillRunId(null);
      return;
    }
    setHighlightedFillRunId(focusFillRunId);
    const el = fillRunRefs.current[focusFillRunId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      // Runs may still be loading — retry shortly
      const t = window.setTimeout(() => {
        fillRunRefs.current[focusFillRunId]?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }, 400);
      return () => window.clearTimeout(t);
    }
  }, [mode, focusFillRunId, researchRuns]);

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

  /**
   * @param opts.useEditedPlan — re-run with planDraft (skip LLM replan)
   */
  const startResearch = async (opts?: { useEditedPlan?: boolean }) => {
    if (!brief.trim()) {
      toast.error(
        'Paste a careers job URL or describe the role (title + location + skills)'
      );
      return;
    }
    const useEdited = !!opts?.useEditedPlan;
    if (useEdited) {
      const p = draftToPlan(planDraft);
      if (!p.titles?.length) {
        toast.error(
          'Add at least one title in the Apollo plan before searching again'
        );
        return;
      }
    }

    setResearching(true);
    setBusyId('research');
    try {
      // When re-running a user-edited plan, locations live in the plan form
      // (do not wipe them with the Location mode toggle).
      const locationPayload = useEdited
        ? undefined
        : fillLocationMode === 'any'
          ? ''
          : fillLocationMode === 'custom' && fillLocation.trim()
            ? fillLocation.trim()
            : undefined; // job default

      const body: Record<string, unknown> = {
        input: brief.trim(),
        limit: 15,
        ...(locationPayload !== undefined ? { location: locationPayload } : {}),
      };
      if (useEdited) {
        body.apolloPlan = draftToPlan(planDraft);
      }

      const res = await fetch('/api/agent/source-candidates', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
      // Prefer real candidate count; do not show "15 people" from raw Apollo
      // usage when the list is empty after filters.
      const displayCount = people.length;
      const returnedPlan =
        data.apolloPlan && typeof data.apolloPlan === 'object'
          ? (data.apolloPlan as ApolloSearchPlanDto)
          : useEdited
            ? draftToPlan(planDraft)
            : undefined;
      const sourceLabel =
        data.apolloPlanSource === 'user' ||
        data.apolloPlanSource === 'llm' ||
        data.apolloPlanSource === 'heuristic'
          ? data.apolloPlanSource
          : useEdited
            ? 'user'
            : undefined;

      if (returnedPlan) {
        setPlanDraft(planToDraft(returnedPlan));
        setPlanSourceLabel(sourceLabel || null);
      }

      let run: ResearchRun = {
        id: `r-${Date.now()}`,
        query: brief.trim(),
        at: new Date().toISOString(),
        count: displayCount,
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
        apolloPlan: returnedPlan,
        apolloPlanSource: sourceLabel as ResearchRun['apolloPlanSource'],
        visibility,
        isOwner: true,
        persisted: false,
      };

      // Persist so teammates can open Fill a job and see public runs
      if (res.ok && people.length) {
        try {
          const saveRes = await fetch('/api/agent/fill-runs', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: run.query,
              visibility,
              jobTitle: run.jobTitle,
              jobLocation: run.jobLocation,
              estimatedCostUsd: cost,
              notes: run.notes,
              candidates: people,
              apolloPlan: returnedPlan,
              apolloPlanSource: sourceLabel,
              usageLine: run.usageLine,
            }),
          });
          const saveData = await saveRes.json().catch(() => ({}));
          if (saveRes.ok && saveData.run?.id) {
            run = {
              ...run,
              id: String(saveData.run.id),
              visibility:
                saveData.run.visibility === 'public' ? 'public' : 'private',
              isOwner: true,
              ownerLabel:
                typeof saveData.run.ownerLabel === 'string'
                  ? saveData.run.ownerLabel
                  : undefined,
              persisted: true,
            };
          }
        } catch {
          /* still show session results */
        }
      }

      setResearchRuns((prev) => [run, ...prev].slice(0, 20));
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
        setPlanExpanded(true);
      } else {
        // Collapse plan so results + links are fully interactive (not buried)
        setPlanExpanded(false);
        const shareNote =
          run.persisted && run.visibility === 'public'
            ? ' · Shared with your team'
            : run.persisted
              ? ' · Private (switch to Public to share)'
              : '';
        toast.success(
          (run.usageLine ||
            `Found ${run.count} candidate(s) for ${data.job?.title || 'this role'} · ~$${cost.toFixed(4)}`) +
            shareNote
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
        light
          ? isCompact
            ? 'rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm'
            : 'bg-white text-slate-900'
          : isCompact
            ? 'rounded-2xl border border-white/10 bg-slate-950 text-white shadow-xl'
            : 'bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white'
      }`}
    >
      {/* Launch form — constrained card on light Agent Desk */}
      <div
        className={`shrink-0 ${
          light && !isCompact
            ? 'border-b border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80 px-4 py-4 sm:px-6'
            : `border-b ${light ? 'border-slate-200' : 'border-white/10'} ${
                isCompact || (isResearch && researchRuns.length > 0)
                  ? 'px-3 py-2.5'
                  : 'px-5 py-5'
              }`
        }`}
      >
        <div
          className={
            light && !isCompact ? 'mx-auto w-full max-w-2xl' : undefined
          }
        >
        {!hideChrome && (
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
              <div
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${
                  light
                    ? 'bg-violet-50 text-violet-800 ring-violet-200'
                    : 'bg-violet-500/20 text-violet-200 ring-violet-400/30'
                }`}
              >
                <Sparkles className="h-3 w-3" />
                Autonomous agent
              </div>
            <h2
              className={`mt-2 font-semibold tracking-tight ${
                light ? 'text-slate-900' : 'text-white'
              } ${isCompact ? 'text-sm' : 'text-lg'}`}
            >
              {isResearch
                ? 'Source candidates for a job'
                : 'Company List Builder'}
            </h2>
            {!isCompact && !(isResearch && researchRuns.length > 0) && (
              <p
                className={`mt-1 text-sm leading-relaxed ${
                  light ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                {isResearch ? (
                  <>
                    Paste a{' '}
                    <span className={light ? 'text-slate-800' : 'text-slate-200'}>
                      careers job URL
                    </span>{' '}
                    or role brief. We read the req, then find{' '}
                    <span className={light ? 'text-slate-800' : 'text-slate-200'}>
                      real people
                    </span>{' '}
                    via Apollo/PDL when available. Cost logs on Usage.
                  </>
                ) : (
                  <>
                    Describe a market. The agent browses company sites and keeps
                    rows with a public{' '}
                    <span className={light ? 'text-slate-800' : 'text-slate-200'}>
                      email or phone
                    </span>{' '}
                    (both preferred). Runs in the background — pause anytime.
                  </>
                )}
              </p>
            )}
          </div>
        </div>
        )}

        {/* Mode toggle — hidden when Agent Desk parent owns Companies/Fill tabs */}
        {!hideChrome && (
        <div
          className={`mt-3 grid grid-cols-2 gap-1 rounded-xl border p-1 ${
            light
              ? 'border-slate-200 bg-slate-50'
              : 'border-white/10 bg-white/5'
          }`}
        >
          <button
            type="button"
            onClick={() => setMode('companies')}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition ${
              mode === 'companies'
                ? 'bg-violet-600 text-white shadow'
                : light
                  ? 'text-slate-600 hover:text-slate-900'
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
                : light
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
            }`}
          >
            <Target className="h-3.5 w-3.5" />
            Fill job
          </button>
        </div>
        )}

        {isResearch && apolloStatus?.probeOk === false && (
          <p className="mt-2 rounded-lg border border-rose-500/35 bg-rose-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-rose-100">
            <strong className="text-rose-50">Apollo key not working.</strong>{' '}
            {apolloStatus.probeError ||
              'People Search returned an auth error.'}{' '}
            Key source: <code className="text-rose-50">{apolloStatus.keySource || '—'}</code>
            {apolloStatus.tenantHasKey
              ? ` · company key ${apolloStatus.tenantKeyHint || 'saved'}`
              : ' · no company key saved'}
            . Open <strong className="text-rose-50">Company Settings → Integrations</strong> and
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
        <div
          className={`space-y-3 ${
            light && !isCompact
              ? 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'
              : isCompact
                ? 'mt-3'
                : 'mt-4'
          }`}
        >
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={isCompact ? 2 : light ? 3 : 3}
            className={`w-full resize-none rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:ring-2 ${
              light
                ? 'border-slate-200 bg-slate-50/80 text-slate-900 placeholder:text-slate-400 focus:border-violet-300 focus:bg-white focus:ring-violet-100'
                : 'border-white/10 bg-white/5 text-white placeholder:text-slate-500 focus:border-violet-400/40 focus:bg-white/[0.07] focus:ring-violet-500/30'
            }`}
            placeholder={
              isResearch
                ? 'Careers job URL or full JD — Apollo filters, then real people'
                : 'e.g. Construction companies in Palm Beach County under 300 employees — HR or owners…'
            }
          />
          {isResearch && (
            <div className="space-y-1.5">
              <label className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Location (optional)
              </label>
              <div
                className={`inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border p-0.5 ${
                  light
                    ? 'border-slate-200 bg-slate-50'
                    : 'border-white/10 bg-white/5'
                }`}
              >
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
                    className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition ${
                      fillLocationMode === opt.id
                        ? 'bg-sky-600 text-white shadow-sm'
                        : light
                          ? 'text-slate-600 hover:bg-white hover:text-slate-900'
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
                  className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                    light
                      ? 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-sky-300'
                      : 'border-white/10 bg-white/5 text-white placeholder:text-slate-500 focus:border-sky-400/40'
                  }`}
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
          {/* Actions row: sharing + launch — not full-bleed purple bars */}
          <div
            className={`flex flex-col gap-3 ${
              light && !isCompact
                ? 'sm:flex-row sm:items-end sm:justify-between'
                : ''
            }`}
          >
            <div className={light ? 'sm:max-w-[220px]' : ''}>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Sharing
              </label>
              <div
                className={`inline-flex rounded-lg border p-0.5 ${
                  light
                    ? 'border-slate-200 bg-slate-50'
                    : 'w-full grid grid-cols-2 gap-1.5 border-white/10 bg-white/5 p-1'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setVisibility('private')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    visibility === 'private'
                      ? isResearch
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'bg-violet-600 text-white shadow-sm'
                      : light
                        ? 'text-slate-600 hover:bg-white hover:text-slate-900'
                        : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Private
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility('public')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    visibility === 'public'
                      ? isResearch
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'bg-violet-600 text-white shadow-sm'
                      : light
                        ? 'text-slate-600 hover:bg-white hover:text-slate-900'
                        : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Public
                </button>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                {isResearch
                  ? visibility === 'public'
                    ? 'Teammates see this run under AI → Fill a job.'
                    : 'Only you see this run (default). Choose Public to share.'
                  : visibility === 'public'
                    ? 'Teammates can view and import this list.'
                    : 'Only you can see this list.'}
              </p>
            </div>
            <div
              className={`flex flex-col gap-1.5 ${
                light && !isCompact ? 'sm:items-end' : ''
              }`}
            >
              {!isCompact && !isResearch && (
                <button
                  type="button"
                  onClick={() => setShowCsv((v) => !v)}
                  className={`inline-flex items-center gap-1.5 text-xs ${
                    light
                      ? 'text-slate-500 hover:text-violet-700'
                      : 'text-slate-400 hover:text-violet-200'
                  }`}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {showCsv ? 'Hide CSV seed' : 'Optional: paste CSV seed list'}
                </button>
              )}
              <div
                className={`flex gap-2 ${
                  light && !isCompact
                    ? 'w-full sm:w-auto sm:flex-row'
                    : 'w-full flex-col'
                }`}
              >
                {isResearch && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={researching}
                    onClick={() => {
                      void loadFillHistory();
                      setFillHistoryOpen(true);
                    }}
                    className={`h-10 rounded-xl text-sm font-semibold ${
                      light && !isCompact
                        ? 'w-full sm:w-auto px-4'
                        : 'w-full h-11'
                    } ${
                      light
                        ? 'border-slate-200 bg-white text-slate-800'
                        : 'border-white/15 bg-transparent text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    <History className="mr-2 h-4 w-4" />
                    History
                    {researchRuns.length > 0 ? ` (${researchRuns.length})` : ''}
                  </Button>
                )}
                <Button
                  type="button"
                  disabled={busyId === 'new' || researching}
                  onClick={() => void startJob()}
                  className={`h-10 rounded-xl text-sm font-semibold text-white shadow-md ${
                    light && !isCompact
                      ? 'w-full sm:w-auto sm:min-w-[200px] px-6'
                      : 'w-full h-11 flex-1'
                  } ${
                    isResearch
                      ? 'bg-sky-600 hover:bg-sky-500 shadow-sky-900/20'
                      : 'bg-violet-600 hover:bg-violet-500 shadow-violet-900/20'
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
                        ? 'Find candidates'
                        : 'Launch company agent'}
                    </>
                  )}
                </Button>
              </div>
              <p
                className={`text-[10px] text-slate-500 ${
                  light && !isCompact ? 'sm:text-right' : 'text-center'
                }`}
              >
                {isResearch
                  ? 'History reopens past runs · 1st run builds Apollo plan'
                  : 'Until usable leads · up to 2 hrs · pause anytime'}
              </p>
            </div>
          </div>
          {showCsv && !isCompact && !isResearch && (
            <textarea
              value={seedCsv}
              onChange={(e) => setSeedCsv(e.target.value)}
              rows={3}
              className={`w-full rounded-lg border px-2.5 py-2 font-mono text-[11px] outline-none ${
                light
                  ? 'border-slate-200 bg-slate-50 text-slate-800'
                  : 'border-white/10 bg-black/20 text-slate-300'
              }`}
              placeholder={
                'company,website,city,contact,email,phone\nAcme Inc,acme.com,Miami,,,'
              }
            />
          )}

          {/* Editable Apollo plan — collapses after results so list/links stay usable */}
          {isResearch && (
            <div className="mt-3 shrink-0 rounded-xl border border-violet-500/30 bg-violet-500/10">
              <button
                type="button"
                onClick={() => setPlanExpanded((v) => !v)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
              >
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-200">
                    Apollo search plan
                    {planSourceLabel ? ` · ${planSourceLabel}` : ''}
                  </p>
                  {!planExpanded && (
                    <p className="mt-0.5 truncate text-[10px] text-slate-400">
                      {(planDraft.titles || 'No titles yet').slice(0, 48)}
                      {planDraft.locations
                        ? ` · ${planDraft.locations}`
                        : ' · anywhere'}
                      {planDraft.mustHave ? ` · ${planDraft.mustHave}` : ''}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-md border border-white/15 px-2 py-0.5 text-[10px] text-violet-100">
                  {planExpanded ? 'Hide plan' : 'Edit plan'}
                </span>
              </button>
              {planExpanded && (
                <div className="max-h-[min(36vh,280px)] space-y-2 overflow-y-auto border-t border-violet-500/20 px-3 pb-3 pt-2">
                  <div>
                    <p className="mb-1 text-[10px] text-slate-400">
                      Quick plays (seed plan, then edit)
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {INDUSTRY_PLAYS.map((play) => (
                        <button
                          key={play.id}
                          type="button"
                          title={play.description}
                          onClick={() => {
                            setPlanDraft({
                              titles: play.titles.join('; '),
                              locations:
                                play.locationHint || planDraft.locations,
                              mustHave: play.mustHaveKeywords.join(', '),
                              keywords: play.keywords.join(', '),
                              seniorities: '',
                            });
                            setPlanSourceLabel('play');
                            toast.success(
                              `Loaded “${play.label}” — edit if needed, then Search again`
                            );
                          }}
                          className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-[10px] font-medium text-violet-100 transition hover:border-violet-300/50 hover:bg-violet-500/25"
                        >
                          {play.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-slate-400">
                      Job titles (LinkedIn-style, use ; between)
                    </label>
                    <textarea
                      value={planDraft.titles}
                      onChange={(e) =>
                        setPlanDraft((d) => ({
                          ...d,
                          titles: e.target.value,
                        }))
                      }
                      rows={2}
                      className="w-full resize-none rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none focus:border-violet-400/50"
                      placeholder="Plant Manager; Manufacturing Manager; Director of Operations"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-0.5 block text-[10px] text-slate-400">
                        Locations (; separated, empty = anywhere)
                      </label>
                      <input
                        value={planDraft.locations}
                        onChange={(e) =>
                          setPlanDraft((d) => ({
                            ...d,
                            locations: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none focus:border-violet-400/50"
                        placeholder="Florida"
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-amber-200/90">
                        Experience / skills Apollo must match
                      </label>
                      <input
                        value={planDraft.mustHave}
                        onChange={(e) =>
                          setPlanDraft((d) => ({
                            ...d,
                            mustHave: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-amber-500/30 bg-black/40 px-2 py-1.5 text-[11px] text-amber-50 outline-none focus:border-amber-400/50"
                        placeholder="CNC — profile/experience keyword, not title"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-0.5 block text-[10px] text-slate-400">
                        Optional keywords
                      </label>
                      <input
                        value={planDraft.keywords}
                        onChange={(e) =>
                          setPlanDraft((d) => ({
                            ...d,
                            keywords: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none focus:border-violet-400/50"
                        placeholder="nice-to-have hard skills"
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] text-slate-400">
                        Seniority (usually empty)
                      </label>
                      <input
                        value={planDraft.seniorities}
                        onChange={(e) =>
                          setPlanDraft((d) => ({
                            ...d,
                            seniorities: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-[11px] text-white outline-none focus:border-violet-400/50"
                        placeholder="rarely needed"
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    disabled={researching || !planDraft.titles.trim()}
                    onClick={() => void startResearch({ useEditedPlan: true })}
                    className="h-9 w-full rounded-lg bg-violet-600 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                  >
                    {researching ? (
                      <>
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        Searching with your plan…
                      </>
                    ) : (
                      'Search again with this plan'
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Results — always scrollable and above any clipped form */}
      <div
        className={`relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain ${
          light && !isCompact ? 'bg-slate-50/50 px-4 py-4 sm:px-6' : 'px-3 py-3'
        }`}
      >
        <div
          className={
            light && !isCompact ? 'mx-auto w-full max-w-3xl' : undefined
          }
        >
        {isResearch ? (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="min-w-0">
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider ${
                    light ? 'text-slate-600' : 'text-slate-500'
                  }`}
                >
                  Run history &amp; matches
                  {researchRuns[0]
                    ? ` · ${researchRuns[0].count} shown`
                    : ''}
                  {researchRuns.some((r) => r.visibility === 'public')
                    ? ' · includes team shares'
                    : ''}
                </span>
                <p
                  className={`mt-0.5 text-[10px] ${
                    light ? 'text-slate-500' : 'text-slate-500'
                  }`}
                >
                  {researchRuns.length > 0
                    ? `${researchRuns.length} saved run${researchRuns.length === 1 ? '' : 's'} · open History anytime`
                    : 'Past Fill job runs appear here after you search'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-[10px] ${light ? 'text-slate-600' : 'text-slate-500'}`}
                >
                  Session ~${researchSpend.toFixed(4)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={`h-8 ${
                    light
                      ? 'border-slate-200 bg-white text-slate-800'
                      : 'border-white/15 bg-transparent text-slate-200 hover:bg-white/10'
                  }`}
                  onClick={() => {
                    void loadFillHistory();
                    setFillHistoryOpen(true);
                  }}
                >
                  <History className="mr-1 h-3.5 w-3.5" />
                  History
                  {researchRuns.length > 0 && (
                    <span
                      className={`ml-1 ${light ? 'text-slate-500' : 'text-slate-400'}`}
                    >
                      {researchRuns.length}
                    </span>
                  )}
                </Button>
              </div>
            </div>

            {researchRuns.length === 0 ? (
              <div
                className={`rounded-2xl border border-dashed px-4 py-10 text-center ${
                  light
                    ? 'border-slate-200 bg-white'
                    : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                <History
                  className={`mx-auto h-8 w-8 ${light ? 'text-slate-300' : 'text-slate-600'}`}
                />
                <p
                  className={`mt-3 text-sm font-medium ${
                    light ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  No fill-job history yet
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Paste a job from Careers (or a role brief) to find people who
                  fit the posting. Runs are saved automatically — use{' '}
                  <span className="font-semibold">History</span> to reopen them.
                  Set Sharing to Public so teammates can see your results.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    void loadFillHistory();
                    setFillHistoryOpen(true);
                  }}
                >
                  <History className="mr-1 h-3.5 w-3.5" />
                  Open history
                </Button>
              </div>
            ) : (
              <ul className="space-y-3">
                {researchRuns.map((run) => {
                  const hasLlmOnly =
                    run.candidates.length > 0 &&
                    run.candidates.every(
                      (c) => c.source === 'llm' || c.source === 'web'
                    );
                  const isFocused = highlightedFillRunId === run.id;
                  return (
                  <li
                    key={run.id}
                    ref={(node) => {
                      fillRunRefs.current[run.id] = node;
                    }}
                    className={`rounded-2xl border p-3 ${
                      isFocused
                        ? light
                          ? 'border-violet-400 bg-violet-50/60 shadow-md ring-2 ring-violet-200'
                          : 'border-violet-400/60 bg-violet-500/10 shadow-md ring-2 ring-violet-500/30'
                        : light
                          ? 'border-slate-200 bg-white shadow-sm'
                          : 'border-white/10 bg-white/[0.04]'
                    }`}
                  >
                    <div
                      className={`flex flex-wrap items-center gap-2 text-[11px] ${
                        light ? 'text-slate-800' : 'text-slate-200'
                      }`}
                    >
                      <span className="font-semibold line-clamp-1">
                        {run.jobTitle || run.query}
                      </span>
                      {run.jobLocation && (
                        <span className={light ? 'text-slate-600' : 'text-slate-500'}>
                          {run.jobLocation}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 ring-1 ${
                          light
                            ? 'bg-sky-50 text-sky-800 ring-sky-200'
                            : 'bg-sky-500/15 text-sky-200 ring-sky-500/25'
                        }`}
                      >
                        {run.count} people
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 ring-1 ${
                          light
                            ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                            : 'bg-emerald-500/10 text-emerald-200 ring-emerald-500/20'
                        }`}
                      >
                        ~${run.estimatedCostUsd.toFixed(4)}
                      </span>
                      {run.visibility === 'public' ? (
                        <span
                          className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${
                            light
                              ? 'bg-violet-50 text-violet-800 ring-violet-200'
                              : 'bg-violet-500/15 text-violet-200 ring-violet-500/25'
                          }`}
                        >
                          Public
                          {!run.isOwner && run.ownerLabel
                            ? ` · ${run.ownerLabel}`
                            : run.isOwner
                              ? ' · team'
                              : ''}
                        </span>
                      ) : (
                        <span
                          className={`rounded-full px-2 py-0.5 ${
                            light
                              ? 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                              : 'bg-white/5 text-slate-400 ring-1 ring-white/10'
                          }`}
                        >
                          Private
                        </span>
                      )}
                      {run.persisted && run.isOwner && (
                        <button
                          type="button"
                          className={`text-[10px] font-semibold underline-offset-2 hover:underline ${
                            light ? 'text-sky-700' : 'text-sky-300'
                          }`}
                          onClick={() => {
                            const next =
                              run.visibility === 'public'
                                ? 'private'
                                : 'public';
                            void (async () => {
                              try {
                                const res = await fetch(
                                  `/api/agent/fill-runs/${run.id}`,
                                  {
                                    method: 'PATCH',
                                    credentials: 'include',
                                    headers: {
                                      'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                      visibility: next,
                                    }),
                                  }
                                );
                                const data = await res.json().catch(() => ({}));
                                if (!res.ok) {
                                  toast.error(
                                    data.error || 'Could not update sharing'
                                  );
                                  return;
                                }
                                setResearchRuns((prev) =>
                                  prev.map((r) =>
                                    r.id === run.id
                                      ? { ...r, visibility: next }
                                      : r
                                  )
                                );
                                toast.success(
                                  data.message ||
                                    (next === 'public'
                                      ? 'Shared with team'
                                      : 'Now private')
                                );
                              } catch {
                                toast.error('Could not update sharing');
                              }
                            })();
                          }}
                        >
                          {run.visibility === 'public'
                            ? 'Make private'
                            : 'Share with team'}
                        </button>
                      )}
                    </div>
                    {run.apolloPlan && (
                      <p className="mt-1.5 text-[10px] leading-snug text-slate-500">
                        Plan
                        {run.apolloPlanSource
                          ? ` (${run.apolloPlanSource})`
                          : ''}
                        : {(run.apolloPlan.titles || []).slice(0, 3).join('; ') ||
                          '—'}
                        {(run.apolloPlan.mustHaveKeywords || []).length > 0
                          ? ` · must ${(run.apolloPlan.mustHaveKeywords || []).join(', ')}`
                          : ''}
                        {(run.apolloPlan.personLocations || []).length
                          ? ` · ${(run.apolloPlan.personLocations || []).join('; ')}`
                          : ' · anywhere'}
                      </p>
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
                    {run.candidates.some(
                      (c) =>
                        c.source === 'apollo' && /\*{2,}/.test(c.name || '')
                    ) && (
                      <p className="mt-2 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2.5 py-2 text-[10px] leading-relaxed text-sky-100/90">
                        <strong className="text-sky-50">
                          Asterisks = Apollo privacy mask, not fake people.
                        </strong>{' '}
                        People Search returns real database records with last
                        names redacted (e.g. Me***). We try to unlock full names
                        via enrichment (uses credits). Use Find on LinkedIn /
                        Google with title + company to verify.
                      </p>
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
                        const fit =
                          typeof c.fitScore === 'number'
                            ? c.fitScore
                            : typeof c.qualityScore === 'number'
                              ? c.qualityScore
                              : undefined;
                        const fitReason = c.fitReason || c.snippet;
                        return (
                        <li
                          key={`${run.id}-${c.id || i}`}
                          className="relative z-10 rounded-lg border border-white/15 bg-slate-900/90 px-2.5 py-2.5 shadow-sm"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {typeof fit === 'number' && (
                                <span
                                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ring-1 ${fitBadgeClass(fit)}`}
                                  title="Fit score vs this job (re-ranked)"
                                >
                                  {fit}
                                </span>
                              )}
                              <p className="text-sm font-semibold text-white">
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
                              {c.mustHaveHit && (
                                <span
                                  className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-amber-500/25 text-amber-100"
                                  title="Must-have skill/experience signal found"
                                >
                                  must-have
                                </span>
                              )}
                              {c.geoOk === false && (
                                <span
                                  className="rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide bg-rose-500/20 text-rose-200"
                                  title="Location may not match job geo"
                                >
                                  geo?
                                </span>
                              )}
                              {c.source === 'apollo' &&
                                /\*{2,}/.test(c.name || '') && (
                                  <span
                                    className="rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide bg-slate-500/25 text-slate-300"
                                    title="Apollo People Search redacts last names until enrichment"
                                  >
                                    masked
                                  </span>
                                )}
                            </div>
                            <p className="mt-0.5 text-[12px] text-slate-300">
                              {[c.title, c.company, c.location]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                            {fitReason && (
                              <p className="mt-1 text-[11px] leading-snug text-violet-100/90 line-clamp-2">
                                {fitReason}
                              </p>
                            )}
                            <div className="relative z-20 mt-2 flex flex-wrap gap-1.5 text-[11px]">
                              {c.email && (
                                <a
                                  href={`mailto:${c.email}`}
                                  className="inline-flex items-center gap-1 rounded-md border border-sky-400/40 bg-sky-500/15 px-2 py-1 font-medium text-sky-100 hover:bg-sky-500/30"
                                >
                                  <Mail className="h-3 w-3" />
                                  Email
                                </a>
                              )}
                              {/* Direct /in/ only when enriched; else people-search (no asterisks in query) */}
                              {c.linkedinUrl &&
                              !isLlm &&
                              /linkedin\.com\/in\//i.test(c.linkedinUrl) ? (
                                <a
                                  href={
                                    c.linkedinUrl.startsWith('http')
                                      ? c.linkedinUrl
                                      : `https://${c.linkedinUrl.replace(/^\/+/, '')}`
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-md border border-sky-400/40 bg-sky-500/15 px-2 py-1 font-medium text-sky-100 hover:bg-sky-500/30"
                                >
                                  <Linkedin className="h-3 w-3" />
                                  Profile
                                </a>
                              ) : (
                                <a
                                  href={liSearch}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-md border border-sky-400/40 bg-sky-500/15 px-2 py-1 font-medium text-sky-100 hover:bg-sky-500/30"
                                  title="Opens LinkedIn people search (first name + title + company)"
                                >
                                  <Linkedin className="h-3 w-3" />
                                  LinkedIn
                                </a>
                              )}
                              <a
                                href={googleSearch}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-2 py-1 font-medium text-white hover:bg-white/20"
                                title="Google: name + title + company + LinkedIn"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Google
                              </a>
                              {c.url && !c.linkedinUrl && (
                                <a
                                  href={c.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-2 py-1 font-medium text-white hover:bg-white/20"
                                >
                                  Source
                                </a>
                              )}
                              {isLlm && (
                                <span className="self-center text-[10px] text-slate-400">
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
        <div className="mb-3 flex items-center justify-between px-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Active & recent
          </span>
          <button
            type="button"
            onClick={() => void load()}
            className={`text-[11px] font-medium ${
              light
                ? 'text-slate-500 hover:text-violet-700'
                : 'text-slate-500 hover:text-slate-300'
            }`}
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
          <div
            className={`rounded-2xl border border-dashed px-4 py-10 text-center ${
              light
                ? 'border-slate-200 bg-white'
                : 'border-white/10 bg-white/[0.02]'
            }`}
          >
            <Clock3
              className={`mx-auto h-8 w-8 ${light ? 'text-slate-300' : 'text-slate-600'}`}
            />
            <p
              className={`mt-3 text-sm font-medium ${
                light ? 'text-slate-700' : 'text-slate-300'
              }`}
            >
              No agents yet
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Launch one above — it runs while you work.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
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
                  className={`group rounded-xl border p-3.5 shadow-sm transition ${
                    light
                      ? 'border-slate-200 bg-white hover:border-violet-200 hover:shadow-md'
                      : 'border-white/10 bg-white/[0.04] hover:border-violet-400/30 hover:bg-white/[0.06]'
                  }`}
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
                        className={`ml-auto inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold shadow-sm transition ${
                          light
                            ? 'bg-violet-600 text-white hover:bg-violet-500'
                            : 'bg-white text-slate-900 hover:bg-violet-100'
                        }`}
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

      {/* Fill-job History drawer (same pattern as Goal agent) */}
      {isResearch && fillHistoryOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            className={`absolute inset-0 ${light ? 'bg-black/30' : 'bg-black/50'}`}
            aria-label="Close history"
            onClick={() => setFillHistoryOpen(false)}
          />
          <div
            className={`relative flex h-full w-full max-w-md flex-col shadow-2xl ${
              light ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'
            }`}
          >
            <div
              className={`flex items-center justify-between border-b px-4 py-3 ${
                light ? 'border-slate-100' : 'border-white/10'
              }`}
            >
              <div className="flex items-center gap-2">
                <History
                  className={`h-4 w-4 ${light ? 'text-slate-700' : 'text-slate-300'}`}
                />
                <div>
                  <h2
                    className={`text-sm font-semibold ${
                      light ? 'text-slate-900' : 'text-white'
                    }`}
                  >
                    Fill job history
                  </h2>
                  <p
                    className={`text-[11px] ${
                      light ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    Your runs + public team shares
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={light ? '' : 'text-slate-300 hover:bg-white/10'}
                  title="Refresh"
                  disabled={fillHistoryLoading}
                  onClick={() => void loadFillHistory()}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      fillHistoryLoading ? 'animate-spin' : ''
                    }`}
                  />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={light ? '' : 'text-slate-300 hover:bg-white/10'}
                  onClick={() => setFillHistoryOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
              {fillHistoryLoading && researchRuns.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading history…
                </div>
              ) : researchRuns.length === 0 ? (
                <p
                  className={`px-2 py-8 text-center text-sm ${
                    light ? 'text-slate-500' : 'text-slate-400'
                  }`}
                >
                  No saved fill-job runs yet. Run Find candidates — results are
                  saved so you can reopen them here.
                </p>
              ) : (
                researchRuns.map((r) => (
                  <div
                    key={r.id}
                    className={`rounded-xl border px-3 py-2.5 ${
                      highlightedFillRunId === r.id
                        ? light
                          ? 'border-sky-300 bg-sky-50'
                          : 'border-sky-500/40 bg-sky-500/15'
                        : light
                          ? 'border-slate-100 bg-white hover:border-slate-200'
                          : 'border-white/10 bg-slate-950/50 hover:border-white/20'
                    }`}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => openFillRunFromHistory(r)}
                    >
                      <div
                        className={`line-clamp-2 text-sm font-medium ${
                          light ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {r.jobTitle || r.query || 'Fill job run'}
                      </div>
                      {r.jobTitle && r.query && r.jobTitle !== r.query && (
                        <div
                          className={`mt-0.5 line-clamp-1 text-[11px] ${
                            light ? 'text-slate-500' : 'text-slate-400'
                          }`}
                        >
                          {r.query}
                        </div>
                      )}
                      <div
                        className={`mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] ${
                          light ? 'text-slate-500' : 'text-slate-400'
                        }`}
                      >
                        <span
                          className={`rounded-full border px-1.5 py-0.5 font-semibold ${
                            r.error
                              ? light
                                ? 'border-rose-200 bg-rose-50 text-rose-800'
                                : 'border-rose-500/30 bg-rose-500/15 text-rose-200'
                              : light
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200'
                          }`}
                        >
                          {r.error ? 'Failed' : `${r.count} people`}
                        </span>
                        <span
                          className={`rounded-full border px-1.5 py-0.5 font-semibold ${
                            r.visibility === 'public'
                              ? light
                                ? 'border-violet-200 bg-violet-50 text-violet-800'
                                : 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                              : light
                                ? 'border-slate-200 text-slate-600'
                                : 'border-white/10 text-slate-400'
                          }`}
                        >
                          {r.visibility === 'public' ? 'Public' : 'Private'}
                          {r.isOwner === false && r.ownerLabel
                            ? ` · ${r.ownerLabel}`
                            : ''}
                        </span>
                        {typeof r.estimatedCostUsd === 'number' &&
                          r.estimatedCostUsd > 0 && (
                            <span>~${r.estimatedCostUsd.toFixed(4)}</span>
                          )}
                        <span>{formatFillWhen(r.at)}</span>
                      </div>
                    </button>
                    {r.persisted && r.isOwner && (
                      <button
                        type="button"
                        className={`mt-1.5 text-[11px] font-semibold hover:underline ${
                          light ? 'text-sky-700' : 'text-sky-300'
                        }`}
                        onClick={() => {
                          const next =
                            r.visibility === 'public' ? 'private' : 'public';
                          void (async () => {
                            try {
                              const res = await fetch(
                                `/api/agent/fill-runs/${r.id}`,
                                {
                                  method: 'PATCH',
                                  credentials: 'include',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                  body: JSON.stringify({ visibility: next }),
                                }
                              );
                              const data = await res.json().catch(() => ({}));
                              if (!res.ok) {
                                toast.error(
                                  data.error || 'Could not update sharing'
                                );
                                return;
                              }
                              setResearchRuns((prev) =>
                                prev.map((x) =>
                                  x.id === r.id
                                    ? { ...x, visibility: next }
                                    : x
                                )
                              );
                              toast.success(
                                data.message ||
                                  (next === 'public'
                                    ? 'Shared with team'
                                    : 'Now private')
                              );
                            } catch {
                              toast.error('Could not update sharing');
                            }
                          })();
                        }}
                      >
                        {r.visibility === 'public'
                          ? 'Make private'
                          : 'Share with team'}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** @deprecated alias — prefer AgentJobDto */
export type ListBuilderJobDto = AgentJobDto;
