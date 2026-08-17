'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  RefreshCw,
  Search,
  MoreHorizontal,
  Trash2,
  Pencil,
  Eye,
  Building2,
  MapPin,
  Users,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  useClients,
  useCreateClient,
  useDeleteClient,
  useUpdateClient,
} from '@/lib/hooks/query-client';
import {
  companyStageLabel,
  companyStageOptions,
  normalizeCompanyStage,
} from '@/lib/schemas/client';
import {
  DEFAULT_PAGE_SIZE,
  PaginationBar,
  paginateItems,
} from '@/components/ui/pagination-bar';
import { FilterStatCards } from '@/components/ui/filter-stat-cards';
import { useTheme } from '@/components/ThemeProvider';
import { useListColumns } from '@/lib/ui/use-list-columns';
import { useAssignmentOwners } from '@/lib/hooks/use-assignment-owners';
import { useJobs } from '@/lib/hooks/query-job';
import { normalizeJobStatus } from '@/lib/jobs/status';
import { toWebsiteHref, websiteLabel } from '@/lib/ui/website-href';
import {
  DataListTable,
  LIST_PAGE_CLASS,
  LIST_TABLE_CLASS,
  ListColumnPicker,
  listTd,
  listTdActions,
  listTdCheck,
  listTdName,
  listTh,
  listThCheck,
  listThName,
  listThRight,
} from '@/components/ui/data-list-table';
import { recordMatchesQuery } from '@/lib/tags';

type SortKey = 'last_activity' | 'name' | 'added' | 'stage' | 'contacts';

type CompanyListRecord = Record<string, any>;

type StageBucket =
  | 'all'
  | 'identification'
  | 'outreach'
  | 'conversation'
  | 'active' // meeting | proposal
  | 'closed_won'
  | 'lost';

/** Progress through the company BD pipeline. */
const PROGRESS_STEPS = [
  {
    key: 'identification',
    label: 'Identified',
    match: ['identification', 'identified', 'new', 'lead', 'known_user'],
  },
  {
    key: 'outreach',
    label: 'Outreach',
    match: ['outreach', 'attempted_outreach', 'contacted'],
  },
  {
    key: 'conversation',
    label: 'Conversation',
    match: ['conversation', 'engaged'],
  },
  {
    key: 'active',
    label: 'In Progress',
    match: ['presented', 'meeting', 'proposal', 'candidate_presented'],
  },
  {
    key: 'closed_won',
    label: 'Won',
    match: ['closed_won', 'won', 'client', 'active'],
  },
] as const;

const STAGE_LABELS: Record<string, string> = {
  ...Object.fromEntries(companyStageOptions.map((s) => [s.id, s.label])),
  presented: 'Proposal',
  candidate_presented: 'Proposal',
};

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
  return normalizeCompanyStage(raw);
}

function stageLabel(stage: string) {
  return (
    STAGE_LABELS[stage] ||
    companyStageLabel(stage) ||
    stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function getProgressIndex(stage: string): number {
  const s = stage.toLowerCase();
  if (s === 'lost') return 0;
  for (let i = PROGRESS_STEPS.length - 1; i >= 0; i--) {
    if ((PROGRESS_STEPS[i].match as readonly string[]).includes(s) || PROGRESS_STEPS[i].key === s) {
      return i + 1;
    }
  }
  return 1;
}

function getProgressColor(step: number, stage?: string) {
  // Known User is its own category — always purple (not early-stage gray)
  if (stage && String(stage).toLowerCase() === 'known_user') {
    return 'bg-purple-500';
  }
  if (step >= 5) return 'bg-emerald-600';
  if (step >= 4) return 'bg-indigo-400';
  if (step >= 3) return 'bg-violet-500';
  if (step >= 2) return 'bg-sky-500';
  return 'bg-slate-400';
}

function stageBadgeClasses(stage: string) {
  const s = stage.toLowerCase();
  if (s === 'lost' || s === 'dnu') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (s === 'closed_won' || s === 'client')
    return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  if (s === 'known_user')
    return 'bg-purple-50 text-purple-800 border-purple-200';
  if (['proposal', 'meeting', 'presented'].includes(s))
    return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  if (s === 'conversation') return 'bg-violet-50 text-violet-700 border-violet-200';
  if (s === 'outreach') return 'bg-sky-50 text-sky-700 border-sky-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
}

function matchesBucket(stage: string, bucket: StageBucket): boolean {
  if (bucket === 'all') return true;
  const s = stage.toLowerCase();
  switch (bucket) {
    case 'identification':
      return ['identification', 'identified', 'new', 'lead', 'known_user'].includes(s);
    case 'outreach':
      return ['outreach', 'attempted_outreach', 'contacted'].includes(s);
    case 'conversation':
      return ['conversation', 'engaged'].includes(s);
    case 'active':
      return ['presented', 'meeting', 'proposal', 'candidate_presented'].includes(s);
    case 'closed_won':
      return ['closed_won', 'won', 'client', 'active'].includes(s);
    case 'lost':
      return s === 'lost' || s === 'dead' || s === 'inactive' || s === 'dnu';
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

function getPrimaryContact(
  company: any
): { id?: string; name: string; email?: string; title?: string } | null {
  const contacts = Array.isArray(company.contacts) ? company.contacts : [];
  if (contacts.length === 0) return null;
  const primary =
    contacts.find((c: any) => c.isPrimary) ||
    contacts.find((c: any) => c.id === company.primaryContactId) ||
    contacts[0];
  if (!primary?.name) return null;
  return {
    id: primary.id ? String(primary.id) : undefined,
    name: primary.name,
    email: primary.email,
    title: primary.title,
  };
}

function locationLine(company: any): string {
  const parts = [company.city, company.state].filter(Boolean);
  return parts.join(', ');
}

function ownerNameFromRecord(record: any, assigned?: { name?: string }): string {
  return (
    assigned?.name ||
    record?.ownerName ||
    record?.accountOwner ||
    record?.owner ||
    record?.createdByName ||
    ''
  );
}

function feeAgreementLabel(company: any): string {
  const raw =
    company.fee_agreement ||
    company.feeAgreement ||
    company.agreementType ||
    company.feeType ||
    '';
  if (raw) return String(raw);
  const pct = company.fee_percent ?? company.feePercent;
  const kind = company.fee_type || company.agreement || '';
  if (pct != null && pct !== '' && kind) return `${pct}% ${kind}`;
  if (kind) return String(kind);
  return '';
}

function nextFollowUpValue(company: any): string {
  return (
    company.next_follow_up ||
    company.nextFollowUp ||
    company.nextFollowUpAt ||
    company.follow_up_at ||
    company.followUpAt ||
    ''
  );
}

/** Optional / toggleable table columns (company + actions always shown). */
type CompanyColumnId =
  | 'primary_contact'
  | 'industry'
  | 'location'
  | 'stage'
  | 'contacts'
  | 'added'
  | 'last_activity'
  | 'account_owner'
  | 'open_jobs'
  | 'fee_agreement'
  | 'next_follow_up';

const COMPANY_COLUMN_DEFS: {
  id: CompanyColumnId;
  label: string;
  defaultOn: boolean;
  isNew?: boolean;
}[] = [
  { id: 'primary_contact', label: 'Primary Contact', defaultOn: true },
  { id: 'stage', label: 'Stage & Progress', defaultOn: true },
  { id: 'account_owner', label: 'Account Owner', defaultOn: true, isNew: true },
  { id: 'open_jobs', label: 'Open Jobs #', defaultOn: true, isNew: true },
  { id: 'fee_agreement', label: 'Fee Agreement', defaultOn: true, isNew: true },
  { id: 'industry', label: 'Industry', defaultOn: false },
  { id: 'contacts', label: 'Contacts', defaultOn: true },
  { id: 'added', label: 'Added', defaultOn: false },
  { id: 'last_activity', label: 'Last Activity', defaultOn: true },
  { id: 'location', label: 'Location', defaultOn: false },
  { id: 'next_follow_up', label: 'Next Follow-up', defaultOn: true, isNew: true },
];

const COLUMNS_STORAGE_KEY = 'trio.companies.tableColumns.v3';

export function CompaniesClient() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { data, isLoading, error, refetch } = useClients();
  const createClientMutation = useCreateClient();
  const deleteClientMutation = useDeleteClient();
  const updateClientMutation = useUpdateClient();

  useEffect(() => {
    const refresh = () => {
      void refetch();
      router.refresh();
    };
    const onCompanies = () => refresh();
    window.addEventListener("trio-companies-changed", onCompanies);
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel("trio-crm-invalidate");
      ch.addEventListener("message", (ev) => {
        if (ev.data?.clients || /company|client/i.test(String(ev.data?.toolsUsed || ""))) {
          refresh();
        }
      });
    } catch {
      /* BroadcastChannel unavailable */
    }
    return () => {
      window.removeEventListener("trio-companies-changed", onCompanies);
      ch?.close();
    };
  }, [refetch, router]);

  const [search, setSearch] = useState('');
  const [bucket, setBucket] = useState<StageBucket>('all');
  const [sortKey, setSortKey] = useState<SortKey>('last_activity');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyIndustry, setNewCompanyIndustry] = useState('');
  const [updatingStageId, setUpdatingStageId] = useState<string | null>(null);
  /** Multi-select for bulk stage changes */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStage, setBulkStage] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [page, setPage] = useState(1);
  const columns = useListColumns(COLUMNS_STORAGE_KEY, COMPANY_COLUMN_DEFS);
  const col = columns.col;
  const { data: ownerMap = {} } = useAssignmentOwners('company');
  const { data: jobsData } = useJobs();
  const setColumnsOpen = columns.setOpen;

  /**
   * Update company BD pipeline stage from the list.
   * Scope: company record only — does not change individual contacts.
   */
  const handleStageChange = async (companyId: string, companyName: string, nextStage: string) => {
    const status = normalizeCompanyStage(nextStage);
    if (!companyId || !status) return;
    setUpdatingStageId(companyId);
    setOpenMenuId(null);
    try {
      const formData = new FormData();
      formData.set('status', status);
      await updateClientMutation.mutateAsync({ clientId: companyId, formData });
      toast.success(
        `${companyName || 'Company'}: stage → ${stageLabel(status)}`
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update stage');
    } finally {
      setUpdatingStageId(null);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBulkStage('');
  };

  /**
   * Apply the same BD pipeline stage to every selected company.
   */
  const handleBulkStageChange = async () => {
    const status = normalizeCompanyStage(bulkStage);
    if (!status || selectedIds.size === 0) {
      toast.error('Select companies and a stage first');
      return;
    }
    setBulkUpdating(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const companyId of Array.from(selectedIds)) {
        try {
          const formData = new FormData();
          formData.set('status', status);
          await updateClientMutation.mutateAsync({ clientId: companyId, formData });
          ok++;
        } catch {
          failed++;
        }
      }
      if (ok > 0) {
        toast.success(
          `Updated ${ok} compan${ok === 1 ? 'y' : 'ies'} → ${stageLabel(status)}`
        );
      }
      if (failed > 0) {
        toast.error(`${failed} update${failed === 1 ? '' : 's'} failed`);
      }
      clearSelection();
      refetch();
    } finally {
      setBulkUpdating(false);
    }
  };

  const companies = useMemo<CompanyListRecord[]>(() => {
    if (Array.isArray(data)) return data as CompanyListRecord[];
    if (data && Array.isArray((data as any).clients)) {
      return (data as any).clients as CompanyListRecord[];
    }
    return [];
  }, [data]);

  const openJobsByCompany = useMemo(() => {
    const raw = Array.isArray(jobsData)
      ? jobsData
      : Array.isArray((jobsData as any)?.jobs)
        ? (jobsData as any).jobs
        : [];
    const counts: Record<string, number> = {};
    for (const job of raw) {
      const companyId = String(job?.companyId || job?.company_id || '');
      if (!companyId) continue;
      if (normalizeJobStatus(job?.status) !== 'Open') continue;
      counts[companyId] = (counts[companyId] || 0) + 1;
    }
    return counts;
  }, [jobsData]);

  const enriched = useMemo(() => {
    return companies.map((c: any) => {
      const stage = normalizeStage(c.status || c.stage || 'identification');
      const progress = getProgressIndex(stage);
      const contacts = Array.isArray(c.contacts) ? c.contacts : [];
      const primary = getPrimaryContact(c);
      const added = c.created_at || c.createdAt;
      const lastActivity = c.modified_at || c.modifiedAt || c.updated_at || c.updatedAt || added;
      const assigned = ownerMap[String(c.id)] || ownerMap[String(c.PK)];
      return {
        raw: c,
        id: String(c.id || c.PK || ''),
        name: c.name || c.companyName || 'Unknown',
        industry: c.industry || '',
        domain: c.domain || c.website || c.url || '',
        location: locationLine(c),
        stage,
        progress,
        contactCount: contacts.length,
        primary,
        added,
        lastActivity,
        ownerName: ownerNameFromRecord(c, assigned),
        openJobs:
          openJobsByCompany[String(c.id)] ??
          (typeof c.open_jobs_posted === 'number' ? c.open_jobs_posted : 0),
        feeAgreement: feeAgreementLabel(c),
        nextFollowUp: nextFollowUpValue(c),
      };
    });
  }, [companies, ownerMap, openJobsByCompany]);

  const stats = useMemo(() => {
    const counts = {
      all: enriched.length,
      identification: 0,
      outreach: 0,
      conversation: 0,
      active: 0,
      closed_won: 0,
      lost: 0,
    };
    for (const c of enriched) {
      if (matchesBucket(c.stage, 'identification')) counts.identification++;
      if (matchesBucket(c.stage, 'outreach')) counts.outreach++;
      if (matchesBucket(c.stage, 'conversation')) counts.conversation++;
      if (matchesBucket(c.stage, 'active')) counts.active++;
      if (matchesBucket(c.stage, 'closed_won')) counts.closed_won++;
      if (matchesBucket(c.stage, 'lost')) counts.lost++;
    }
    return counts;
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = enriched.filter((c) => {
      if (!matchesBucket(c.stage, bucket)) return false;
      if (!q) return true;
      return recordMatchesQuery({
        query: search,
        fields: [
          c.name,
          c.industry,
          c.domain,
          c.location,
          c.stage,
          c.primary?.name,
          c.primary?.email,
          c.ownerName,
          c.feeAgreement,
        ],
        tags: Array.isArray(c.raw?.tags) ? c.raw.tags : [],
      });
    });

    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'added':
          return new Date(b.added || 0).getTime() - new Date(a.added || 0).getTime();
        case 'stage':
          return b.progress - a.progress;
        case 'contacts':
          return b.contactCount - a.contactCount;
        case 'last_activity':
        default:
          return new Date(b.lastActivity || 0).getTime() - new Date(a.lastActivity || 0).getTime();
      }
    });

    return list;
  }, [enriched, search, bucket, sortKey]);

  // Reset to first page when filters/sort change
  useEffect(() => {
    setPage(1);
  }, [search, bucket, sortKey]);

  const paged = useMemo(
    () => paginateItems(filtered, page, DEFAULT_PAGE_SIZE),
    [filtered, page]
  );

  const handleCreateCompany = async () => {
    if (!newCompanyName.trim()) {
      alert('Company name is required');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('name', newCompanyName.trim());
      if (newCompanyIndustry.trim()) formData.append('industry', newCompanyIndustry.trim());
      formData.append('status', 'identification');
      await createClientMutation.mutateAsync(formData);
      setShowForm(false);
      setNewCompanyName('');
      setNewCompanyIndustry('');
      refetch();
    } catch (err: any) {
      alert(err?.message || 'Failed to create company');
    }
  };

  const handleDeleteCompany = async (companyId: string, companyName: string) => {
    if (!confirm(`Are you sure you want to delete ${companyName}?`)) return;
    try {
      await deleteClientMutation.mutateAsync(companyId);
      setOpenMenuId(null);
      refetch();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete company');
    }
  };

  // Same pastel + dark-ink scheme as Candidates (shared FilterStatCards)
  const statCards = [
    {
      key: 'all',
      label: 'All Companies',
      sub: 'Click to show all',
      count: stats.all,
      tone: 'neutral' as const,
    },
    {
      key: 'identification',
      label: 'Identified',
      sub: 'New accounts',
      count: stats.identification,
      tone: 'slate' as const,
    },
    {
      key: 'outreach',
      label: 'Outreach',
      sub: 'In outreach',
      count: stats.outreach,
      tone: 'sky' as const,
    },
    {
      key: 'conversation',
      label: 'Conversation',
      sub: 'Engaged',
      count: stats.conversation,
      tone: 'violet' as const,
    },
    {
      key: 'active',
      label: 'In Progress',
      sub: 'Presented → proposal',
      count: stats.active,
      tone: 'indigo' as const,
    },
    {
      key: 'closed_won',
      label: 'Closed Won',
      sub: 'Clients',
      count: stats.closed_won,
      tone: 'forest' as const,
    },
    {
      key: 'lost',
      label: 'Lost',
      sub: 'This period',
      count: stats.lost,
      tone: 'rose' as const,
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Companies</h1>
          <p className="text-sm text-gray-500">Manage your client companies</p>
        </div>
        <div className="flex items-center justify-center py-16 text-gray-500">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <span className="ml-3">Loading companies...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Companies</h1>
            <p className="text-sm text-gray-500">Manage your client companies</p>
          </div>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <div className="text-red-600 text-lg font-semibold mb-2">Error Loading Companies</div>
          <p className="text-red-600 text-sm">{(error as Error).message}</p>
          <Button onClick={() => refetch()} className="mt-4">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={LIST_PAGE_CLASS}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Companies</h1>
          <p className="text-sm text-gray-500">
            Manage your client pipeline — click any card to filter
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? 'Cancel' : 'Quick add'}
          </Button>
          <Button
            size="sm"
            onClick={() => router.push('/dashboard/companies/new')}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Company
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm max-w-lg">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick add company</h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
              placeholder="Company name"
              className="bg-white"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateCompany()}
            />
            <Input
              value={newCompanyIndustry}
              onChange={(e) => setNewCompanyIndustry(e.target.value)}
              placeholder="Industry (optional)"
              className="bg-white"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateCompany()}
            />
            <Button
              onClick={handleCreateCompany}
              disabled={createClientMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 shrink-0"
            >
              {createClientMutation.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      )}

      <FilterStatCards
        cards={statCards}
        activeKey={bucket}
        onSelect={(key) => setBucket(key as StageBucket)}
        className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3"
      />

      {/* Search / sort bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
            style={{ color: isDark ? 'rgba(255,255,255,0.7)' : undefined }}
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search companies..."
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
                : 'border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm'
            }
            style={isDark ? { color: '#ffffff', backgroundColor: '#1e293b' } : undefined}
            aria-label="Sort companies"
          >
            <option value="last_activity">Sort: Last Activity</option>
            <option value="added">Sort: Date Added</option>
            <option value="name">Sort: Name</option>
            <option value="stage">Sort: Stage</option>
            <option value="contacts">Sort: Contacts</option>
          </select>

          <ListColumnPicker
            defs={COMPANY_COLUMN_DEFS}
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
            alwaysOnNote="Company name and Actions always stay on. Use the arrows to change order."
          />

          <span
            className="text-xs font-medium whitespace-nowrap"
            style={{ color: isDark ? '#ffffff' : undefined }}
          >
            {filtered.length} compan{filtered.length === 1 ? 'y' : 'ies'}
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
          itemLabel={paged.total === 1 ? 'company' : 'companies'}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm"
        />
      )}

      {/* Bulk selection toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3 shadow-sm">
          <div className="text-sm font-medium text-blue-900">
            {selectedIds.size} selected
          </div>
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <select
              value={bulkStage}
              onChange={(e) => setBulkStage(e.target.value)}
              className="border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm min-w-[10rem]"
              aria-label="Bulk pipeline stage"
            >
              <option value="">Set stage…</option>
              {companyStageOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
              disabled={!bulkStage || bulkUpdating}
              onClick={() => void handleBulkStageChange()}
            >
              {bulkUpdating ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Updating…
                </>
              ) : (
                'Apply stage'
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={clearSelection}
              disabled={bulkUpdating}
            >
              Clear selection
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Building2 className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-semibold mb-2 text-gray-900">
            {companies.length === 0 ? 'No Companies Yet' : 'No matches'}
          </h2>
          <p className="text-gray-500 max-w-md mx-auto mb-6 text-sm">
            {companies.length === 0
              ? 'Add your first client company to start tracking the business-development pipeline.'
              : 'Try a different search or clear the stage filter.'}
          </p>
          <div className="flex justify-center gap-2">
            {bucket !== 'all' && (
              <Button variant="outline" onClick={() => setBucket('all')}>
                Clear filter
              </Button>
            )}
            <Button
              onClick={() => router.push('/dashboard/companies/new')}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="mr-2 h-4 w-4" /> Add Company
            </Button>
          </div>
        </div>
      ) : (
        <DataListTable>
            <table className={LIST_TABLE_CLASS}>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className={listThCheck}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      aria-label="Select all visible companies"
                      checked={
                        filtered.length > 0 &&
                        filtered.every((c: { id: string }) => selectedIds.has(c.id))
                      }
                      ref={(el) => {
                        if (!el) return;
                        const some = filtered.some((c: { id: string }) =>
                          selectedIds.has(c.id)
                        );
                        const all =
                          filtered.length > 0 &&
                          filtered.every((c: { id: string }) =>
                            selectedIds.has(c.id)
                          );
                        el.indeterminate = some && !all;
                      }}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(
                            new Set(
                              filtered.map((c: { id: string }) => String(c.id))
                            )
                          );
                        } else {
                          clearSelection();
                        }
                      }}
                    />
                  </th>
                  <th className={listThName}>
                    Company
                  </th>
                  {columns.visibleIds.map((id) => (
                    <th key={id} className={listTh}>
                      {COMPANY_COLUMN_DEFS.find((d) => d.id === id)?.label}
                    </th>
                  ))}
                  <th className={listThRight}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paged.slice.map((c) => (
                  <tr
                    key={c.id}
                    className={`group hover:bg-gray-50/80 transition-colors ${
                      selectedIds.has(c.id) ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    <td className={listTdCheck(selectedIds.has(c.id))}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        aria-label={`Select ${c.name}`}
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleSelected(String(c.id))}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className={listTdName(selectedIds.has(c.id))}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`h-9 w-9 shrink-0 rounded-full ${avatarColor(c.name)} text-white flex items-center justify-center text-xs font-semibold`}
                        >
                          {getInitials(c.name)}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/dashboard/companies/${c.id}`}
                            className="font-medium text-sm text-blue-600 hover:text-blue-700 hover:underline truncate block"
                          >
                            {c.name}
                          </Link>
                          {(() => {
                            const href = toWebsiteHref(c.domain);
                            if (href) {
                              return (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-xs text-blue-600 hover:underline truncate block"
                                  title={href}
                                >
                                  {websiteLabel(c.domain)}
                                </a>
                              );
                            }
                            if (!col('location') && c.location) {
                              return (
                                <div className="text-xs text-gray-500 truncate flex items-center gap-1">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  {c.location}
                                </div>
                              );
                            }
                            return (
                              <div className="text-xs text-gray-400 truncate">—</div>
                            );
                          })()}
                        </div>
                      </div>
                    </td>

                    {columns.visibleIds.map((colId) => {
                      switch (colId) {
                        case 'primary_contact':
                          return (
                            <td key={colId} className={listTd}>
                              {c.primary ? (
                                <div className="min-w-0">
                                  {c.primary.id ? (
                                    <Link
                                      href={`/dashboard/contact-info/${encodeURIComponent(c.primary.id)}?companyId=${encodeURIComponent(c.id)}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline block truncate"
                                      title={`Open contact: ${c.primary.name}`}
                                    >
                                      {c.primary.name}
                                    </Link>
                                  ) : (
                                    <Link
                                      href={`/dashboard/companies/${c.id}?tab=contacts`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline block truncate"
                                      title="Open company contacts"
                                    >
                                      {c.primary.name}
                                    </Link>
                                  )}
                                  <span className="text-xs text-gray-500 block truncate">
                                    {c.primary.title || c.primary.email || '—'}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-sm text-gray-400 italic">No contacts</span>
                              )}
                            </td>
                          );
                        case 'industry':
                          return (
                            <td
                              key={colId}
                              className={`${listTd} text-sm text-gray-700 truncate`}
                              title={c.industry || undefined}
                            >
                              {c.industry || '—'}
                            </td>
                          );
                        case 'location':
                          return (
                            <td key={colId} className={`${listTd} text-sm text-gray-700`}>
                              <span className="inline-flex items-center gap-1 min-w-0">
                                {c.location ? (
                                  <>
                                    <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                    <span className="truncate">{c.location}</span>
                                  </>
                                ) : (
                                  '—'
                                )}
                              </span>
                            </td>
                          );
                        case 'stage':
                          return (
                            <td key={colId} className={listTd}>
                              <div className="space-y-1.5 min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="relative inline-flex items-center">
                                    <select
                                      value={
                                        companyStageOptions.some((o) => o.id === c.stage)
                                          ? c.stage
                                          : normalizeCompanyStage(c.stage)
                                      }
                                      disabled={updatingStageId === c.id}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        if (e.target.value === c.stage) return;
                                        void handleStageChange(c.id, c.name, e.target.value);
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      title="Change company pipeline stage (does not update contacts)"
                                      aria-label={`Pipeline stage for ${c.name}`}
                                      className={`appearance-none cursor-pointer pr-6 pl-2 py-0.5 rounded-full border text-[11px] font-medium max-w-[9.5rem] truncate disabled:opacity-60 disabled:cursor-wait focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${stageBadgeClasses(c.stage)}`}
                                    >
                                      {!companyStageOptions.some((o) => o.id === c.stage) && (
                                        <option value={c.stage}>{stageLabel(c.stage)}</option>
                                      )}
                                      {companyStageOptions.map((opt) => (
                                        <option key={opt.id} value={opt.id}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                    <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-current opacity-60">
                                      {updatingStageId === c.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <ChevronDown className="h-3 w-3" />
                                      )}
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-gray-400 tabular-nums shrink-0">
                                    {c.stage === 'lost' || c.stage === 'dnu'
                                      ? '—'
                                      : `${Math.min(c.progress, 5)} of 5`}
                                  </span>
                                </div>
                                {c.stage !== 'lost' && c.stage !== 'dnu' && (
                                  <div className="flex gap-0.5">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                      <div
                                        key={i}
                                        className={`h-1.5 flex-1 rounded-full ${
                                          i < c.progress
                                            ? getProgressColor(c.progress, c.stage)
                                            : 'bg-gray-200'
                                        }`}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        case 'contacts':
                          return (
                            <td key={colId} className={listTd}>
                              <Link
                                href={`/dashboard/companies/${c.id}?tab=contacts`}
                                className="inline-flex items-center gap-1.5 text-sm text-gray-700 hover:text-blue-600"
                              >
                                <Users className="h-3.5 w-3.5 text-gray-400" />
                                <span className="tabular-nums font-medium">{c.contactCount}</span>
                              </Link>
                            </td>
                          );
                        case 'added':
                          return (
                            <td
                              key={colId}
                              className={`${listTd} text-sm text-gray-600 whitespace-nowrap`}
                            >
                              {formatShortDate(c.added)}
                            </td>
                          );
                        case 'last_activity':
                          return (
                            <td
                              key={colId}
                              className={`${listTd} text-sm text-gray-600 whitespace-nowrap`}
                            >
                              {formatRelativeActivity(c.lastActivity)}
                            </td>
                          );
                        case 'account_owner':
                          return (
                            <td key={colId} className={listTd}>
                              {c.ownerName ? (
                                <span className="inline-flex items-center gap-2 min-w-0">
                                  <span
                                    className={`h-7 w-7 shrink-0 rounded-full ${avatarColor(c.ownerName)} text-white text-[10px] font-semibold flex items-center justify-center`}
                                  >
                                    {getInitials(c.ownerName)}
                                  </span>
                                  <span className="truncate text-sm text-gray-800">
                                    {c.ownerName}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-sm text-gray-400">—</span>
                              )}
                            </td>
                          );
                        case 'open_jobs':
                          return (
                            <td key={colId} className={`${listTd} text-sm text-gray-800 tabular-nums`}>
                              {c.openJobs}
                            </td>
                          );
                        case 'fee_agreement':
                          return (
                            <td key={colId} className={`${listTd} text-sm text-gray-700 truncate`}>
                              {c.feeAgreement || '—'}
                            </td>
                          );
                        case 'next_follow_up':
                          return (
                            <td
                              key={colId}
                              className={`${listTd} text-sm text-gray-600 whitespace-nowrap`}
                            >
                              {formatShortDate(c.nextFollowUp)}
                            </td>
                          );
                        default:
                          return null;
                      }
                    })}

                    <td className={listTdActions(selectedIds.has(c.id))}>
                      <div className="relative inline-flex items-center gap-0.5 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => router.push(`/dashboard/companies/${c.id}`)}
                          title="View"
                        >
                          <Eye className="h-4 w-4 text-gray-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            setColumnsOpen(false);
                            setOpenMenuId((id) => (id === c.id ? null : c.id));
                          }}
                          title="More actions"
                        >
                          <MoreHorizontal className="h-4 w-4 text-gray-500" />
                        </Button>
                        {openMenuId === c.id && (
                          <div className="absolute right-0 bottom-9 z-30 w-40 rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-left">
                            <button
                              type="button"
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                              onClick={() => {
                                setOpenMenuId(null);
                                router.push(`/dashboard/companies/${c.id}`);
                              }}
                            >
                              <Eye className="h-3.5 w-3.5" /> View
                            </button>
                            <button
                              type="button"
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                              onClick={() => {
                                setOpenMenuId(null);
                                router.push(`/dashboard/companies/${c.id}/edit`);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </button>
                            <button
                              type="button"
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                              onClick={() => handleDeleteCompany(c.id, c.name)}
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
