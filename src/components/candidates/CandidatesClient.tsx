'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  MoreHorizontal,
  Trash2,
  Pencil,
  Eye,
  Combine,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  useLeads,
  useDeleteLead,
  useUpdateLeadStatus,
} from '@/lib/hooks/query-lead';
import { ResumeCreateCard } from '@/components/candidates/ResumeCreateCard';
import { MergeCandidatesModal } from '@/components/candidate/MergeCandidatesModal';
import { StageChangeNoteModal } from '@/components/candidate/StageChangeNoteModal';
import { DeskNextActions } from '@/components/desk/DeskNextActions';
import {
  APPLICATION_STAGES,
  mapLegacyStageToApplicationStage,
  getStageLabel,
} from '@/lib/schemas/lead';
import { noteTypeFromStage } from '@/lib/candidates/note-type-stage';

type SortKey = 'last_activity' | 'name' | 'added' | 'stage';

type StageBucket =
  | 'all'
  | 'submitted'
  | 'interviewing'
  | 'offer_out'
  | 'placed'
  | 'rejected';

/** Canonical progress bar used in the list (matches candidate detail pipeline). */
const PROGRESS_STEPS = [
  {
    key: 'sourced',
    label: 'Sourced',
    match: [
      'sourced',
      'left_message',
      'text',
      'email',
      'other',
      'contacted',
      'identification',
      'outreach',
      'new',
      'identified',
    ],
  },
  { key: 'applied', label: 'Applied', match: ['applied', 'application'] },
  { key: 'interested', label: 'Interested', match: ['interested'] },
  {
    key: 'submitted',
    label: 'Submitted',
    match: ['pre_screened', 'submitted', 'presented', 'conversation', 'qualified'],
  },
  {
    key: 'interviewing',
    label: 'Interviewing',
    match: [
      'interviewing',
      'interview',
      'second_interview',
      'third_interview',
      '2nd_interview',
      '3rd_interview',
    ],
  },
  { key: 'offer_out', label: 'Offer Out', match: ['offer_out', 'offer_accepted', 'offer'] },
  { key: 'placed', label: 'Placed', match: ['placed', 'accept', 'converted', 'hired'] },
] as const;

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function avatarColor(name: string) {
  const palette = [
    'bg-blue-600',
    'bg-indigo-600',
    'bg-violet-600',
    'bg-emerald-600',
    'bg-teal-600',
    'bg-orange-600',
    'bg-rose-600',
    'bg-cyan-600',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i) * 17) % palette.length;
  return palette[hash];
}

function normalizeStage(raw?: string): string {
  if (!raw) return 'sourced';
  const s = String(raw).trim();
  // Prefer application stages if already matching
  if (APPLICATION_STAGES.some((a) => a.value === s)) return s;
  // Lowercase application stage
  const lower = s.toLowerCase().replace(/\s+/g, '_');
  if (APPLICATION_STAGES.some((a) => a.value === lower)) return lower;
  return mapLegacyStageToApplicationStage(s);
}

function stageLabel(stage: string) {
  const found = APPLICATION_STAGES.find((s) => s.value === stage);
  if (found) return found.label;
  // Pretty-print progress step labels
  const step = PROGRESS_STEPS.find((p) => p.key === stage || p.match.includes(stage));
  if (step) return step.label;
  return stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getProgressIndex(stage: string): number {
  const s = stage.toLowerCase();
  if (['rejected', 'not_interested', 'offer_declined', 'dnu', 'do_not_use'].includes(s))
    return 0;
  for (let i = PROGRESS_STEPS.length - 1; i >= 0; i--) {
    if (PROGRESS_STEPS[i].match.includes(s) || PROGRESS_STEPS[i].key === s) {
      return i + 1; // 1-based step completed
    }
  }
  return 1;
}

/**
 * Resolve display stage from status AND linked job stages.
 * Prefer the furthest-along non-rejected stage so list UI stays correct even if
 * status and linkedJobs briefly diverge (legacy bug: status-only updates).
 */
function getPrimaryStage(candidate: any): string {
  const linked = Array.isArray(candidate.linkedJobs) ? candidate.linkedJobs : [];
  const candidates: string[] = [];
  const statusRaw = candidate.status || candidate.stage;
  if (statusRaw) candidates.push(normalizeStage(statusRaw));
  for (const j of linked) {
    if (j?.stage) candidates.push(normalizeStage(j.stage));
  }
  if (candidates.length === 0) return 'sourced';

  // Rejected wins if status is rejected
  const statusNorm = statusRaw ? normalizeStage(statusRaw) : '';
  if (
    ['rejected', 'not_interested', 'offer_declined', 'withdrawn'].includes(
      statusNorm
    )
  ) {
    return statusNorm;
  }

  let best = candidates[0];
  let bestIdx = getProgressIndex(best);
  for (const s of candidates) {
    if (['rejected', 'not_interested', 'offer_declined', 'withdrawn'].includes(s)) {
      continue;
    }
    const idx = getProgressIndex(s);
    if (idx > bestIdx) {
      best = s;
      bestIdx = idx;
    }
  }
  return best;
}

function getProgressColor(step: number) {
  if (step >= 5) return 'bg-emerald-500';
  if (step >= 4) return 'bg-amber-500';
  if (step >= 3) return 'bg-violet-500';
  if (step >= 2) return 'bg-sky-500';
  return 'bg-slate-400';
}

function stageBadgeClasses(stage: string) {
  const s = stage.toLowerCase();
  if (['rejected', 'not_interested', 'offer_declined', 'dnu', 'do_not_use'].includes(s)) {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }
  if (['placed', 'accept', 'converted', 'hired'].includes(s)) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (['offer_out', 'offer_accepted', 'offer'].includes(s)) {
    return 'bg-amber-50 text-amber-800 border-amber-200';
  }
  if (
    [
      'interviewing',
      'interview',
      'second_interview',
      'third_interview',
    ].includes(s)
  ) {
    return 'bg-violet-50 text-violet-700 border-violet-200';
  }
  if (['submitted', 'pre_screened', 'presented'].includes(s)) {
    return 'bg-sky-50 text-sky-700 border-sky-200';
  }
  return 'bg-slate-50 text-slate-700 border-slate-200';
}

function formatSourceLabel(source?: string): string {
  if (!source) return 'Manual';
  const map: Record<string, string> = {
    manual: 'Manual',
    linkedin: 'LinkedIn',
    referral: 'Referral',
    website: 'Website',
    indeed: 'Indeed',
    zip: 'Zip',
    ziprecruiter: 'Zip',
    job_board: 'Job Board',
    resume: 'Resume Upload',
    other: 'Other',
  };
  const key = String(source).trim().toLowerCase().replace(/\s+/g, '_');
  return map[key] || source;
}

/** Stages shown in the list dropdown (application pipeline). */
const LIST_STAGE_OPTIONS = APPLICATION_STAGES.map((s) => ({
  id: s.value,
  label: s.label,
}));

function matchesBucket(stage: string, bucket: StageBucket): boolean {
  if (bucket === 'all') return true;
  const s = stage.toLowerCase();
  switch (bucket) {
    case 'submitted':
      return ['submitted', 'pre_screened', 'presented', 'conversation', 'qualified'].includes(s);
    case 'interviewing':
      return ['interviewing', 'interview'].includes(s);
    case 'offer_out':
      return ['offer_out', 'offer_accepted', 'offer'].includes(s);
    case 'placed':
      return ['placed', 'accept', 'converted', 'hired'].includes(s);
    case 'rejected':
      return ['rejected', 'not_interested', 'offer_declined'].includes(s);
    default:
      return true;
  }
}

function formatShortDate(value?: string) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

function formatRelativeActivity(value?: string) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((startToday.getTime() - startThat.getTime()) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function getLinkedJob(candidate: any): { title: string; company?: string; jobId?: string } | null {
  const jobs = Array.isArray(candidate.linkedJobs) ? candidate.linkedJobs : [];
  if (jobs.length > 0) {
    return {
      title: jobs[0].jobTitle || 'Linked job',
      company: jobs[0].companyName,
      jobId: jobs[0].jobId,
    };
  }
  if (candidate.jobTitle || candidate.linkedJobTitle) {
    return {
      title: candidate.jobTitle || candidate.linkedJobTitle,
      company: candidate.companyName,
    };
  }
  return null;
}

export function CandidatesClient() {
  const router = useRouter();
  const { data: leads = [], isLoading, error, refetch, isFetching } = useLeads();
  const deleteLeadMutation = useDeleteLead();
  const updateLeadStatusMutation = useUpdateLeadStatus();

  const [search, setSearch] = useState('');
  const [bucket, setBucket] = useState<StageBucket>('all');
  const [sortKey, setSortKey] = useState<SortKey>('last_activity');
  const [showResumeCard, setShowResumeCard] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [mergeCandidate, setMergeCandidate] = useState<{
    id: string;
    name: string;
    email?: string;
    createdAt?: string;
  } | null>(null);
  /** Pending stage change from list dropdown — confirm with optional note */
  const [pendingStageChange, setPendingStageChange] = useState<{
    id: string;
    name: string;
    oldStage: string;
    newStage: string;
    jobTitle: string;
  } | null>(null);
  const [stageApplying, setStageApplying] = useState(false);

  const candidates = useMemo(() => (Array.isArray(leads) ? leads : []), [leads]);

  const enriched = useMemo(() => {
    return candidates.map((c: any) => {
      const stage = getPrimaryStage(c);
      const progress = getProgressIndex(stage);
      const linked = getLinkedJob(c);
      const added = c.created_at || c.createdAt;
      const lastActivity = c.modified_at || c.modifiedAt || c.updated_at || added;
      return {
        raw: c,
        id: c.id,
        name: c.name || 'Unknown',
        title: c.title || c.jobTitle || '',
        email: c.email || '',
        source: formatSourceLabel(c.source),
        stage,
        progress,
        linked,
        added,
        lastActivity,
      };
    });
  }, [candidates]);

  /**
   * User picked a new stage in the list — open note modal first (can skip).
   */
  const onStageSelect = (
    candidate: {
      id: string;
      name: string;
      stage: string;
      linked: { title: string } | null;
    },
    nextStage: string
  ) => {
    if (!candidate.id || !nextStage || nextStage === candidate.stage) return;
    setOpenMenuId(null);
    setPendingStageChange({
      id: candidate.id,
      name: candidate.name || 'Candidate',
      oldStage: candidate.stage,
      newStage: nextStage,
      jobTitle: candidate.linked?.title || 'Candidate pipeline',
    });
  };

  /**
   * Apply stage update (+ optional activity note) after modal Save / Skip.
   */
  const applyPendingStageChange = async (noteText: string) => {
    if (!pendingStageChange) return;
    const { id, name, oldStage, newStage } = pendingStageChange;
    setStageApplying(true);
    try {
      await updateLeadStatusMutation.mutateAsync({
        leadId: id,
        newStatus: newStage,
        oldStatus: oldStage,
      });

      const trimmed = (noteText || '').trim();
      if (trimmed) {
        const noteType = noteTypeFromStage(newStage) || 'general';
        const res = await fetch(`/api/candidate/${encodeURIComponent(id)}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            noteText: trimmed,
            // Use general so we don't double-apply stage (status already updated)
            noteType: 'general',
            stage: newStage,
            metadata: { stageChangeNote: true, from: oldStage, to: newStage, noteType },
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.warn('[Candidates] stage note failed', data);
          toast.error('Stage updated, but note failed to save');
        }
      }

      // useUpdateLeadStatus already toasts on success
      setPendingStageChange(null);
      void refetch();
    } catch (err: any) {
      // mutation also toasts; keep fallback if thrown outside
      if (!err?.message?.includes('Failed to move')) {
        toast.error(err?.message || 'Failed to update stage');
      }
    } finally {
      setStageApplying(false);
    }
  };

  const stats = useMemo(() => {
    const counts = {
      all: enriched.length,
      submitted: 0,
      interviewing: 0,
      offer_out: 0,
      placed: 0,
      rejected: 0,
    };
    for (const c of enriched) {
      if (matchesBucket(c.stage, 'submitted')) counts.submitted++;
      if (matchesBucket(c.stage, 'interviewing')) counts.interviewing++;
      if (matchesBucket(c.stage, 'offer_out')) counts.offer_out++;
      if (matchesBucket(c.stage, 'placed')) counts.placed++;
      if (matchesBucket(c.stage, 'rejected')) counts.rejected++;
    }
    return counts;
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = enriched.filter((c) => {
      if (!matchesBucket(c.stage, bucket)) return false;
      if (!q) return true;
      const hay = [
        c.name,
        c.title,
        c.email,
        c.source,
        c.stage,
        c.linked?.title,
        c.linked?.company,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });

    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'added':
          return new Date(b.added || 0).getTime() - new Date(a.added || 0).getTime();
        case 'stage':
          return b.progress - a.progress;
        case 'last_activity':
        default:
          return new Date(b.lastActivity || 0).getTime() - new Date(a.lastActivity || 0).getTime();
      }
    });

    return list;
  }, [enriched, search, bucket, sortKey]);

  const goToNewCandidate = () => {
    router.push('/dashboard/candidates/new');
  };

  const handleDeleteCandidate = async (leadId: string, candidateName: string) => {
    if (!confirm(`Are you sure you want to delete ${candidateName}?`)) {
      return;
    }

    try {
      await deleteLeadMutation.mutateAsync(leadId);
      setOpenMenuId(null);
      refetch();
    } catch (err: any) {
      console.error('Delete candidate error:', err);
      alert(`Failed to delete candidate: ${err?.message || 'Unknown error'}`);
    }
  };

  const statCards: {
    key: StageBucket;
    label: string;
    sub: string;
    count: number;
    ring: string;
    bg: string;
    text: string;
  }[] = [
    {
      key: 'all',
      label: 'All Candidates',
      sub: 'Click to show all',
      count: stats.all,
      ring: 'ring-blue-200',
      bg: 'bg-white',
      text: 'text-gray-900',
    },
    {
      key: 'submitted',
      label: 'Submitted',
      sub: 'Awaiting feedback',
      count: stats.submitted,
      ring: 'ring-sky-100',
      bg: 'bg-sky-50/80',
      text: 'text-sky-900',
    },
    {
      key: 'interviewing',
      label: 'Interviewing',
      sub: 'In process',
      count: stats.interviewing,
      ring: 'ring-violet-100',
      bg: 'bg-violet-50/80',
      text: 'text-violet-900',
    },
    {
      key: 'offer_out',
      label: 'Offer Out',
      sub: 'Pending decision',
      count: stats.offer_out,
      ring: 'ring-amber-100',
      bg: 'bg-amber-50/80',
      text: 'text-amber-900',
    },
    {
      key: 'placed',
      label: 'Placed YTD',
      sub: 'Closed wins',
      count: stats.placed,
      ring: 'ring-emerald-100',
      bg: 'bg-emerald-50/80',
      text: 'text-emerald-900',
    },
    {
      key: 'rejected',
      label: 'Rejected',
      sub: 'This period',
      count: stats.rejected,
      ring: 'ring-rose-100',
      bg: 'bg-rose-50/70',
      text: 'text-rose-900',
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Candidates</h1>
          <p className="text-sm text-gray-500">Manage your candidate pipeline</p>
        </div>
        <div className="flex items-center justify-center py-16 text-gray-500">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <span className="ml-3">Loading candidates...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Candidates</h1>
            <p className="text-sm text-gray-500">Manage your candidate pipeline</p>
          </div>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <div className="text-red-600 text-lg font-semibold mb-2">Error Loading Candidates</div>
          <p className="text-red-600 text-sm">{(error as Error).message}</p>
          <Button onClick={() => refetch()} className="mt-4">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 w-full max-w-none pb-10">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Candidates</h1>
          <p className="text-sm text-gray-500">
            {enriched.length} candidate{enriched.length === 1 ? '' : 's'}
            {isFetching ? ' · refreshing…' : ''} — click any card to filter
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh list"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowResumeCard((v) => !v)}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            AI Source
          </Button>
          <Button size="sm" onClick={goToNewCandidate} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" />
            Add Candidate
          </Button>
        </div>
      </div>

      {showResumeCard && <ResumeCreateCard />}

      <DeskNextActions compact limit={8} />

      {/* Pipeline stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {statCards.map((card) => {
          const active = bucket === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setBucket(card.key)}
              className={`text-left rounded-2xl border px-4 py-3.5 shadow-sm transition-all ${card.bg} ${
                active
                  ? `ring-2 ${card.ring} border-blue-300 shadow-md`
                  : 'border-gray-200 hover:border-gray-300 hover:shadow'
              }`}
            >
              <div className={`text-2xl font-semibold tabular-nums ${card.text}`}>{card.count}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 mt-1">
                {card.label}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">{card.sub}</div>
            </button>
          );
        })}
      </div>

      {/* Search / sort bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search candidates..."
            className="pl-9 bg-white"
          />
        </div>
        <div className="flex items-center gap-3">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
            aria-label="Sort candidates"
          >
            <option value="last_activity">Sort: Last Activity</option>
            <option value="added">Sort: Date Added</option>
            <option value="name">Sort: Name</option>
            <option value="stage">Sort: Stage</option>
          </select>
          <span className="text-xs text-gray-500 whitespace-nowrap">
            Showing {filtered.length} candidate{filtered.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="text-4xl mb-4">👤</div>
          <h2 className="text-xl font-semibold mb-2 text-gray-900">
            {candidates.length === 0 ? 'No Candidates Yet' : 'No matches'}
          </h2>
          <p className="text-gray-500 max-w-md mx-auto mb-6 text-sm">
            {candidates.length === 0
              ? 'Upload a resume via AI Source, or add a candidate manually.'
              : 'Try a different search or clear the stage filter.'}
          </p>
          <div className="flex justify-center gap-2">
            {bucket !== 'all' && (
              <Button variant="outline" onClick={() => setBucket('all')}>
                Clear filter
              </Button>
            )}
            <Button onClick={goToNewCandidate} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" /> Add Candidate
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
          {/* Horizontal scroll so Last Activity / Actions are not clipped */}
          <div className="overflow-x-auto pb-1">
            <table className="w-full min-w-[1100px] table-fixed">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[18%]" />
                <col className="w-[10%]" />
                <col className="w-[20%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Candidate
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Linked Job
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Source
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Stage &amp; Progress
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Added
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Last Activity
                  </th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => {
                  const stageValue = LIST_STAGE_OPTIONS.some((o) => o.id === c.stage)
                    ? c.stage
                    : normalizeStage(c.stage);
                  const isUpdating =
                    stageApplying && pendingStageChange?.id === c.id;
                  return (
                    <tr key={c.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`h-9 w-9 shrink-0 rounded-full ${avatarColor(c.name)} text-white flex items-center justify-center text-xs font-semibold`}
                          >
                            {getInitials(c.name)}
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/dashboard/candidates/${c.id}`}
                              className="font-medium text-sm text-blue-600 hover:text-blue-700 hover:underline truncate block"
                            >
                              {c.name}
                            </Link>
                            <div className="text-xs text-gray-500 truncate">
                              {c.title || c.email || '—'}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        {c.linked ? (
                          <div className="min-w-0">
                            {c.linked.jobId ? (
                              <Link
                                href={`/dashboard/jobs/${c.linked.jobId}`}
                                className="text-sm text-blue-600 hover:underline font-medium block truncate"
                              >
                                {c.linked.title}
                              </Link>
                            ) : (
                              <span className="text-sm text-gray-800 font-medium block truncate">
                                {c.linked.title}
                              </span>
                            )}
                            {c.linked.company ? (
                              <span className="text-xs text-gray-500 block truncate">
                                {c.linked.company}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400 italic">No job linked</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-sm text-gray-700 truncate">
                        {c.source || 'Manual'}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="space-y-1.5 min-w-[160px]">
                          <div className="flex items-center gap-2">
                            <div className="relative inline-flex items-center min-w-0">
                              <select
                                value={
                                  LIST_STAGE_OPTIONS.some((o) => o.id === c.stage)
                                    ? c.stage
                                    : stageValue
                                }
                                disabled={isUpdating || stageApplying}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  const next = e.target.value;
                                  if (!next || next === c.stage) return;
                                  onStageSelect(c, next);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                title="Change candidate pipeline stage (optional note after)"
                                aria-label={`Pipeline stage for ${c.name}`}
                                className={`appearance-none cursor-pointer pr-6 pl-2 py-0.5 rounded-full border text-[11px] font-medium max-w-[10.5rem] truncate disabled:opacity-60 disabled:cursor-wait focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${stageBadgeClasses(c.stage)}`}
                              >
                                {!LIST_STAGE_OPTIONS.some((o) => o.id === c.stage) && (
                                  <option value={c.stage}>{stageLabel(c.stage)}</option>
                                )}
                                {LIST_STAGE_OPTIONS.map((opt) => (
                                  <option key={opt.id} value={opt.id}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                              <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-current opacity-60">
                                {isUpdating ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" />
                                )}
                              </span>
                            </div>
                            <span className="text-[11px] text-gray-400 tabular-nums shrink-0">
                              {Math.min(c.progress, 5)} of 5
                            </span>
                          </div>
                          <div className="flex gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <div
                                key={i}
                                className={`h-1.5 flex-1 rounded-full ${
                                  i < c.progress
                                    ? getProgressColor(c.progress)
                                    : 'bg-gray-200'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">
                        {formatShortDate(c.added)}
                      </td>

                      <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">
                        {formatRelativeActivity(c.lastActivity)}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="relative inline-flex items-center gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => router.push(`/dashboard/candidates/${c.id}`)}
                            title="View"
                          >
                            <Eye className="h-4 w-4 text-gray-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() =>
                              setOpenMenuId((id) => (id === c.id ? null : c.id))
                            }
                            title="More actions"
                          >
                            <MoreHorizontal className="h-4 w-4 text-gray-500" />
                          </Button>
                          {openMenuId === c.id && (
                            <div className="absolute right-0 top-9 z-30 w-44 rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-left">
                              <button
                                type="button"
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  router.push(`/dashboard/candidates/${c.id}`);
                                }}
                              >
                                <Eye className="h-3.5 w-3.5" /> View
                              </button>
                              <button
                                type="button"
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  router.push(`/dashboard/candidates/${c.id}/edit`);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </button>
                              <button
                                type="button"
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setMergeCandidate({
                                    id: c.id,
                                    name: c.name || 'Candidate',
                                    email: c.email,
                                    createdAt: c.added,
                                  });
                                }}
                              >
                                <Combine className="h-3.5 w-3.5" /> Merge
                              </button>
                              <button
                                type="button"
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                                onClick={() => handleDeleteCandidate(c.id, c.name)}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {mergeCandidate && (
        <MergeCandidatesModal
          open={!!mergeCandidate}
          onClose={() => setMergeCandidate(null)}
          currentCandidate={mergeCandidate}
        />
      )}

      <StageChangeNoteModal
        isOpen={!!pendingStageChange}
        newStage={pendingStageChange?.newStage || ''}
        newStageLabel={
          pendingStageChange
            ? getStageLabel(pendingStageChange.newStage) ||
              stageLabel(pendingStageChange.newStage)
            : undefined
        }
        jobTitle={pendingStageChange?.jobTitle || 'Candidate pipeline'}
        candidateName={pendingStageChange?.name || 'Candidate'}
        isApplying={stageApplying}
        onSaveNote={async (note) => {
          await applyPendingStageChange(note);
        }}
        onSkip={() => {
          void applyPendingStageChange('');
        }}
      />
    </div>
  );
}
