'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  MoreHorizontal,
  Trash2,
  Pencil,
  Eye,
  Briefcase,
  Users,
  Building2,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDeleteJob } from '@/lib/hooks/query-job';
import {
  normalizeJobStatus,
  jobStatusBadgeClasses,
  jobStatusSortRank,
  type JobStatus,
} from '@/lib/jobs/status';
import {
  DEFAULT_PAGE_SIZE,
  PaginationBar,
  paginateItems,
} from '@/components/ui/pagination-bar';
import { FilterStatCards } from '@/components/ui/filter-stat-cards';
import { useTheme } from '@/components/ThemeProvider';
import { useListColumns } from '@/lib/ui/use-list-columns';
import { useAssignmentOwners } from '@/lib/hooks/use-assignment-owners';
import { isJobOpenForCareers } from '@/lib/jobs/status';
import {
  DataListTable,
  LIST_PAGE_CLASS,
  LIST_TABLE_CLASS,
  ListColumnPicker,
  listTd,
  listTdActions,
  listTdNameFlush,
  listTh,
  listThNameFlush,
  listThRight,
} from '@/components/ui/data-list-table';
import { recordMatchesQuery } from '@/lib/tags';

export type JobListItem = {
  id: string;
  title: string;
  employmentType?: string;
  companyId?: string;
  companyName?: string;
  status?: string;
  candidates?: any[];
  createdAt?: string;
  modifiedAt?: string;
  location?: string;
  salaryRange?: string;
  showOnWebsite?: boolean;
  tags?: string[];
};

type SortKey = 'last_activity' | 'title' | 'added' | 'candidates' | 'status';

type JobBucket =
  | 'all'
  | 'open'
  | 'paused'
  | 'filled'
  | 'lost'
  | 'closed'
  | 'with_candidates'
  | 'no_candidates';

interface JobListViewProps {
  jobs: JobListItem[];
  /** When true, parent already provides header — only render filters + table */
  embedded?: boolean;
}

function getInitials(title: string) {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[Math.min(1, parts.length - 1)][0]}`.toUpperCase();
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

function normalizeStatus(raw?: string): JobStatus {
  return normalizeJobStatus(raw);
}

function statusBadgeClasses(status: string) {
  return jobStatusBadgeClasses(status);
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

function statusSortRank(status: string) {
  return jobStatusSortRank(status);
}

type JobColumnId =
  | 'company'
  | 'type'
  | 'status'
  | 'posted_status'
  | 'posted'
  | 'owner'
  | 'candidates'
  | 'added'
  | 'last_activity'
  | 'location';

const JOB_COLUMN_DEFS: {
  id: JobColumnId;
  label: string;
  defaultOn: boolean;
  isNew?: boolean;
}[] = [
  { id: 'company', label: 'Company', defaultOn: true },
  { id: 'posted_status', label: 'Posted', defaultOn: true, isNew: true },
  { id: 'posted', label: 'Posted Date', defaultOn: true, isNew: true },
  { id: 'status', label: 'Status', defaultOn: true },
  { id: 'owner', label: 'Owner', defaultOn: true, isNew: true },
  { id: 'type', label: 'Type', defaultOn: true },
  { id: 'candidates', label: 'Candidates', defaultOn: true },
  { id: 'added', label: 'Added', defaultOn: false },
  { id: 'last_activity', label: 'Last Action', defaultOn: true },
  { id: 'location', label: 'Location', defaultOn: false },
];

const JOB_COLUMNS_KEY = 'trio.jobs.tableColumns.v3';

export function JobListView({ jobs }: JobListViewProps) {
  const router = useRouter();
  const deleteJob = useDeleteJob();
  const { isDark } = useTheme();

  const [search, setSearch] = useState('');
  const [bucket, setBucket] = useState<JobBucket>('all');
  const [sortKey, setSortKey] = useState<SortKey>('last_activity');
  const [page, setPage] = useState(1);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const columns = useListColumns(JOB_COLUMNS_KEY, JOB_COLUMN_DEFS);
  const col = columns.col;
  const { data: ownerMap = {} } = useAssignmentOwners('job');

  const enriched = useMemo(() => {
    return (Array.isArray(jobs) ? jobs : []).map((j) => {
      const status = normalizeStatus(j.status);
      const candidates = Array.isArray(j.candidates) ? j.candidates : [];
      const added = j.createdAt;
      const lastActivity = j.modifiedAt || j.createdAt;
      const posted = j.createdAt;
      const isPosted = j.showOnWebsite !== false && isJobOpenForCareers(status);
      const assigned = ownerMap[String(j.id)];
      return {
        ...j,
        status,
        candidateCount: candidates.length,
        added,
        lastActivity,
        posted,
        isPosted,
        ownerName:
          assigned?.name ||
          (j as any).ownerName ||
          (j as any).createdByName ||
          '',
      };
    });
  }, [jobs, ownerMap]);

  const stats = useMemo(() => {
    const counts = {
      all: enriched.length,
      open: 0,
      paused: 0,
      filled: 0,
      lost: 0,
      closed: 0,
      with_candidates: 0,
      no_candidates: 0,
    };
    for (const j of enriched) {
      if (j.status === 'Open') counts.open++;
      if (j.status === 'Paused') counts.paused++;
      if (j.status === 'Filled') counts.filled++;
      if (j.status === 'Lost') counts.lost++;
      if (j.status === 'Closed') counts.closed++;
      if (j.candidateCount > 0) counts.with_candidates++;
      else counts.no_candidates++;
    }
    return counts;
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = enriched.filter((j) => {
      switch (bucket) {
        case 'open':
          if (j.status !== 'Open') return false;
          break;
        case 'paused':
          if (j.status !== 'Paused') return false;
          break;
        case 'filled':
          if (j.status !== 'Filled') return false;
          break;
        case 'lost':
          if (j.status !== 'Lost') return false;
          break;
        case 'closed':
          if (j.status !== 'Closed') return false;
          break;
        case 'with_candidates':
          if (j.candidateCount === 0) return false;
          break;
        case 'no_candidates':
          if (j.candidateCount > 0) return false;
          break;
        default:
          break;
      }
      if (!q) return true;
      return recordMatchesQuery({
        query: search,
        fields: [
          j.title,
          j.companyName,
          j.employmentType,
          j.status,
          j.location,
          j.salaryRange,
          j.ownerName,
          j.isPosted ? 'posted' : 'not posted',
        ],
        tags: j.tags,
      });
    });

    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'added':
          return new Date(b.added || 0).getTime() - new Date(a.added || 0).getTime();
        case 'candidates':
          return b.candidateCount - a.candidateCount;
        case 'status':
          return statusSortRank(b.status) - statusSortRank(a.status);
        case 'last_activity':
        default:
          return (
            new Date(b.lastActivity || 0).getTime() - new Date(a.lastActivity || 0).getTime()
          );
      }
    });

    return list;
  }, [enriched, search, bucket, sortKey]);

  // Reset to page 1 when filters change (same as candidates / contacts)
  useEffect(() => {
    setPage(1);
  }, [search, bucket, sortKey]);

  const paged = useMemo(
    () => paginateItems(filtered, page, DEFAULT_PAGE_SIZE),
    [filtered, page]
  );

  // Keep page in range if list shrinks (e.g. after delete)
  useEffect(() => {
    if (page > paged.totalPages) setPage(paged.totalPages);
  }, [page, paged.totalPages]);

  const handleDelete = (jobId: string, jobTitle: string) => {
    if (!confirm(`Delete job "${jobTitle}"? This cannot be undone.`)) return;
    deleteJob.mutate(jobId, {
      onSuccess: () => setOpenMenuId(null),
    });
  };

  // Same pastel + dark-ink scheme as Candidates (shared FilterStatCards)
  const statCards = [
    {
      key: 'all',
      label: 'All Jobs',
      sub: 'Click to show all',
      count: stats.all,
      tone: 'neutral' as const,
    },
    {
      key: 'open',
      label: 'Open',
      sub: 'Actively hiring',
      count: stats.open,
      tone: 'emerald' as const,
    },
    {
      key: 'paused',
      label: 'Paused',
      sub: 'Temporarily on hold',
      count: stats.paused,
      tone: 'slate' as const,
    },
    {
      key: 'filled',
      label: 'Filled',
      sub: 'Placed / won',
      count: stats.filled,
      tone: 'sky' as const,
    },
    {
      key: 'lost',
      label: 'Lost',
      sub: 'Lost the req',
      count: stats.lost,
      tone: 'rose' as const,
    },
    {
      key: 'closed',
      label: 'Closed',
      sub: 'Closed out',
      count: stats.closed,
      tone: 'slate' as const,
    },
    {
      key: 'with_candidates',
      label: 'With Pipeline',
      sub: 'Has candidates',
      count: stats.with_candidates,
      tone: 'indigo' as const,
    },
    {
      key: 'no_candidates',
      label: 'Empty',
      sub: 'No candidates yet',
      count: stats.no_candidates,
      tone: 'violet' as const,
    },
  ];

  return (
    <div className={LIST_PAGE_CLASS}>
      <FilterStatCards
        cards={statCards}
        activeKey={bucket}
        onSelect={(key) => setBucket(key as JobBucket)}
        className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8 gap-3"
      />

      {/* Search / sort */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
            style={{ color: isDark ? 'rgba(255,255,255,0.7)' : undefined }}
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search jobs..."
            className={
              isDark
                ? 'pl-9 bg-[#1e293b] border-slate-500 text-white placeholder:text-white/60'
                : 'pl-9 bg-white'
            }
            style={isDark ? { color: '#ffffff', backgroundColor: '#1e293b' } : undefined}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className={
              isDark
                ? 'border border-slate-500 rounded-lg px-3 py-2 text-sm bg-[#1e293b] text-white shadow-sm'
                : 'border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 shadow-sm'
            }
            style={isDark ? { color: '#ffffff', backgroundColor: '#1e293b' } : undefined}
            aria-label="Sort jobs"
          >
            <option value="last_activity">Sort: Last Action</option>
            <option value="added">Sort: Date Added</option>
            <option value="title">Sort: Title</option>
            <option value="candidates">Sort: Candidates</option>
            <option value="status">Sort: Status</option>
          </select>
          <ListColumnPicker
            defs={JOB_COLUMN_DEFS}
            order={columns.order}
            col={columns.col}
            toggle={columns.toggle}
            move={columns.move}
            reorder={columns.reorder}
            reset={columns.reset}
            open={columns.open}
            setOpen={(next) => {
              setOpenMenuId(null);
              columns.setOpen(next);
            }}
            alwaysOnNote="Job title and Actions always stay on. Use the arrows to change order."
          />
          <span
            className="text-xs font-medium whitespace-nowrap"
            style={{ color: isDark ? '#ffffff' : undefined }}
          >
            {filtered.length} job{filtered.length === 1 ? '' : 's'}
            {filtered.length > DEFAULT_PAGE_SIZE
              ? ` · page ${paged.page}/${paged.totalPages}`
              : ''}
          </span>
        </div>
      </div>

      {filtered.length > 0 && (
        <PaginationBar
          page={paged.page}
          totalPages={paged.totalPages}
          total={paged.total}
          onPageChange={setPage}
          itemLabel={paged.total === 1 ? 'job' : 'jobs'}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm"
        />
      )}

      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Briefcase className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-semibold mb-2 text-gray-900">
            {enriched.length === 0 ? 'No Jobs Yet' : 'No matches'}
          </h2>
          <p className="text-gray-500 max-w-md mx-auto mb-6 text-sm">
            {enriched.length === 0
              ? 'Create a job posting to start tracking candidates against open roles.'
              : 'Try a different search or clear the status filter.'}
          </p>
          {bucket !== 'all' && (
            <Button variant="outline" onClick={() => setBucket('all')}>
              Clear filter
            </Button>
          )}
        </div>
      ) : (
        <DataListTable>
            <table className={LIST_TABLE_CLASS}>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className={listThNameFlush}>
                    Job
                  </th>
                  {columns.visibleIds.map((id) => (
                    <th key={id} className={listTh}>
                      {JOB_COLUMN_DEFS.find((d) => d.id === id)?.label}
                    </th>
                  ))}
                  <th className={listThRight}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paged.slice.map((j) => (
                  <tr key={j.id} className="group hover:bg-gray-50/80 transition-colors">
                    <td className={listTdNameFlush()}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`h-9 w-9 shrink-0 rounded-full ${avatarColor(j.title)} text-white flex items-center justify-center text-xs font-semibold`}
                        >
                          {getInitials(j.title)}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/dashboard/jobs/${j.id}`}
                            className="font-medium text-sm text-blue-600 hover:text-blue-700 hover:underline truncate block"
                          >
                            {j.title}
                          </Link>
                          <div className="text-xs text-gray-500 truncate">
                            {(!col('location') && j.location) || j.salaryRange || '—'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {columns.visibleIds.map((colId) => {
                      switch (colId) {
                        case 'company':
                          return (
                            <td key={colId} className={listTd}>
                              {j.companyName || j.companyId ? (
                                j.companyId ? (
                                  <Link
                                    href={`/dashboard/companies/${j.companyId}`}
                                    className="inline-flex items-center gap-2 min-w-0 text-sm font-medium text-slate-800 hover:text-blue-600"
                                  >
                                    <Building2 className="h-4 w-4 text-slate-500 shrink-0" />
                                    <span className="truncate">{j.companyName || 'Company'}</span>
                                  </Link>
                                ) : (
                                  <span className="inline-flex items-center gap-2 min-w-0 text-sm font-medium text-slate-800">
                                    <Building2 className="h-4 w-4 text-slate-500 shrink-0" />
                                    <span className="truncate">{j.companyName}</span>
                                  </span>
                                )
                              ) : (
                                <span className="text-sm text-gray-400">—</span>
                              )}
                            </td>
                          );
                        case 'type':
                          return (
                            <td key={colId} className={listTd}>
                              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                {j.employmentType || 'Full-time'}
                              </span>
                            </td>
                          );
                        case 'status':
                          return (
                            <td key={colId} className={listTd}>
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClasses(j.status)}`}
                              >
                                {j.status}
                              </span>
                            </td>
                          );
                        case 'candidates':
                          return (
                            <td key={colId} className={listTd}>
                              <Link
                                href={`/dashboard/jobs/${j.id}`}
                                className="inline-flex items-center gap-1.5 text-sm text-gray-700 hover:text-blue-600"
                              >
                                <Users className="h-3.5 w-3.5 text-gray-400" />
                                <span className="tabular-nums font-medium">{j.candidateCount}</span>
                              </Link>
                            </td>
                          );
                        case 'added':
                          return (
                            <td
                              key={colId}
                              className={`${listTd} text-sm text-gray-600 whitespace-nowrap`}
                            >
                              {formatShortDate(j.added)}
                            </td>
                          );
                        case 'last_activity':
                          return (
                            <td
                              key={colId}
                              className={`${listTd} text-sm text-gray-600 whitespace-nowrap`}
                            >
                              {formatRelativeActivity(j.lastActivity)}
                            </td>
                          );
                        case 'location':
                          return (
                            <td key={colId} className={`${listTd} text-sm text-gray-700`}>
                              {j.location ? (
                                <span className="inline-flex items-center gap-1 min-w-0">
                                  <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                  <span className="truncate">{j.location}</span>
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                          );
                        case 'posted_status':
                          return (
                            <td key={colId} className={listTd}>
                              <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                                <span
                                  className={`h-2 w-2 rounded-full ${
                                    j.isPosted ? 'bg-emerald-500' : 'bg-slate-300'
                                  }`}
                                />
                                {j.isPosted ? 'Posted' : 'Not posted'}
                              </span>
                            </td>
                          );
                        case 'posted':
                          return (
                            <td
                              key={colId}
                              className={`${listTd} text-sm text-slate-800 whitespace-nowrap`}
                            >
                              {formatShortDate(j.posted)}
                            </td>
                          );
                        case 'owner':
                          return (
                            <td key={colId} className={listTd}>
                              {j.ownerName ? (
                                <span className="inline-flex items-center gap-2 min-w-0">
                                  <span
                                    className={`h-7 w-7 shrink-0 rounded-full ${avatarColor(j.ownerName)} text-white text-[10px] font-semibold flex items-center justify-center`}
                                  >
                                    {getInitials(j.ownerName)}
                                  </span>
                                  <span className="truncate text-sm text-gray-800">
                                    {j.ownerName}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-sm text-gray-400">—</span>
                              )}
                            </td>
                          );
                        default:
                          return null;
                      }
                    })}

                    <td className={listTdActions(false)}>
                      <div className="relative inline-flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => router.push(`/dashboard/jobs/${j.id}`)}
                          title="View"
                        >
                          <Eye className="h-4 w-4 text-gray-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            columns.setOpen(false);
                            setOpenMenuId((id) => (id === j.id ? null : j.id));
                          }}
                          title="More actions"
                        >
                          <MoreHorizontal className="h-4 w-4 text-gray-500" />
                        </Button>
                        {openMenuId === j.id && (
                          <div className="absolute right-0 top-9 z-20 w-40 rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-left">
                            <button
                              type="button"
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                              onClick={() => {
                                setOpenMenuId(null);
                                router.push(`/dashboard/jobs/${j.id}`);
                              }}
                            >
                              <Eye className="h-3.5 w-3.5" /> View
                            </button>
                            <button
                              type="button"
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                              onClick={() => {
                                setOpenMenuId(null);
                                router.push(`/dashboard/jobs/${j.id}?edit=true`);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </button>
                            <button
                              type="button"
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                              onClick={() => handleDelete(j.id, j.title)}
                              disabled={deleteJob.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </DataListTable>
      )}
    </div>
  );
}
