'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowUpRight,
  Briefcase,
  Calendar,
  Filter,
  Gauge,
  LineChart,
  Plus,
  Share2,
  Target,
  Trophy,
  Upload,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ReportingStats } from '@/lib/aws/reporting';
import { formatMoney } from '@/lib/invoices/fee';
import {
  REPORT_CATALOG,
  REPORT_CATEGORIES,
  isReportId,
  type ReportCategory,
  type ReportDefinition,
  type ReportId,
  type ReportTone,
} from '@/lib/reporting/report-catalog';

type LibraryFilter = 'all' | ReportCategory;

type CustomReport = {
  id: string;
  title: string;
  basedOn: ReportId;
  category: ReportCategory;
};

const CUSTOM_KEY = 'trio-report-library-custom';
const GOALS_KEY = 'trio-report-library-goals';
const DIGEST_KEY = 'trio-report-library-digest';

const TONE: Record<
  ReportTone,
  { icon: string; badge: string; chip: string }
> = {
  blue: {
    icon: 'bg-blue-50 text-blue-700',
    badge: 'bg-blue-50 text-blue-700',
    chip: 'border-blue-100 bg-white text-slate-600',
  },
  peach: {
    icon: 'bg-orange-50 text-orange-700',
    badge: 'bg-orange-50 text-orange-800',
    chip: 'border-orange-100 bg-white text-slate-600',
  },
  mint: {
    icon: 'bg-emerald-50 text-emerald-700',
    badge: 'bg-emerald-50 text-emerald-800',
    chip: 'border-emerald-100 bg-white text-slate-600',
  },
};

function reportIcon(id: ReportId | string) {
  switch (id) {
    case 'funnel':
      return Filter;
    case 'pipeline-health':
      return Gauge;
    case 'recruiter-activity':
      return Users;
    case 'time-to-fill':
      return Calendar;
    case 'revenue':
      return Wallet;
    case 'commission':
      return LineChart;
    case 'goals':
      return Target;
    case 'leaderboard':
      return Trophy;
    case 'source':
      return Upload;
    case 'candidates-added':
      return UserPlus;
    case 'client-scorecard':
      return Briefcase;
    case 'digest':
      return Calendar;
    default:
      return Filter;
  }
}

function loadCustom(): CustomReport[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustom(rows: CustomReport[]) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(rows));
}

async function copyShareUrl(path: string) {
  const url =
    typeof window === 'undefined' ? path : `${window.location.origin}${path}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Share link copied');
  } catch {
    toast.error('Could not copy link');
  }
}

export function ReportLibrary({
  stats,
  reportId,
}: {
  stats: ReportingStats;
  reportId?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [custom, setCustom] = useState<CustomReport[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBasedOn, setNewBasedOn] = useState<ReportId>('funnel');

  useEffect(() => {
    setCustom(loadCustom());
  }, []);

  const setReport = (id: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', 'library');
    if (id) next.set('report', id);
    else next.delete('report');
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const active = isReportId(reportId)
    ? REPORT_CATALOG.find((r) => r.id === reportId)
    : custom.find((c) => c.id === reportId)
      ? REPORT_CATALOG.find(
          (r) => r.id === custom.find((c) => c.id === reportId)?.basedOn
        )
      : null;
  const customActive = custom.find((c) => c.id === reportId);

  const cards = useMemo(() => {
    const extras: ReportDefinition[] = custom.map((c) => {
      const base = REPORT_CATALOG.find((r) => r.id === c.basedOn)!;
      return {
        ...base,
        id: c.id as ReportId,
        title: c.title,
        category: c.category,
        description: `Custom view based on ${base.title}.`,
      };
    });
    return [...REPORT_CATALOG, ...extras].filter(
      (r) => filter === 'all' || r.category === filter
    );
  }, [custom, filter]);

  if (reportId && (active || customActive)) {
    const def = active || REPORT_CATALOG.find((r) => r.id === customActive?.basedOn);
    if (!def) return null;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setReport(null)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Report library
          </button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              copyShareUrl(
                `${pathname}?tab=library&report=${reportId}&period=${searchParams.get('period') || 'ytd'}`
              )
            }
          >
            <Share2 className="mr-1.5 h-4 w-4" />
            Share
          </Button>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {def.category}
          </p>
          <h2 className="text-xl font-semibold text-slate-900">
            {customActive?.title || def.title}
          </h2>
          <p className="mt-1 text-sm text-slate-600">{def.description}</p>
        </div>
        <ReportDetail stats={stats} id={def.id} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Report library
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {REPORT_CATEGORIES.map((c) => {
              const on = filter === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFilter(c.id)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                    on
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-slate-700"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            New custom report
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-blue-600 text-white hover:bg-blue-700"
            onClick={() =>
              copyShareUrl(
                `${pathname}?tab=library&period=${searchParams.get('period') || 'ytd'}`
              )
            }
          >
            <Share2 className="mr-1.5 h-4 w-4" />
            Share reports
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((report) => {
          const Icon = reportIcon(isReportId(report.id) ? report.id : 'funnel');
          const tone = TONE[report.tone];
          const destTab = isReportId(report.id)
            ? TAB_FOR_REPORT[report.id]
            : TAB_FOR_REPORT[custom.find((c) => c.id === report.id)?.basedOn || 'funnel'];
          const period = searchParams.get('period') || 'ytd';
          const href = destTab
            ? `${pathname}?tab=${destTab}&period=${period}`
            : `${pathname}?tab=library&report=${report.id}&period=${period}`;
          return (
            <article
              key={report.id}
              data-ink-on-light
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`rounded-xl p-2.5 ${tone.icon}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.badge}`}
                >
                  {report.category}
                </span>
              </div>
              <h3 className="mt-3 text-base font-semibold text-slate-900">
                {report.title}
              </h3>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-600">
                {report.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {report.chips.map((chip) => (
                  <span
                    key={chip}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${tone.chip}`}
                  >
                    {chip}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  className="text-sm font-medium text-blue-700 hover:underline"
                  onClick={() =>
                    copyShareUrl(href)
                  }
                >
                  Share
                </button>
                <Link
                  href={href}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                  aria-label={`Open ${report.title}`}
                >
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New custom report</DialogTitle>
            <DialogDescription>
              Name a saved view based on an existing report. It stays in this
              browser until we add shared team reports.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="custom-report-name">Name</Label>
              <Input
                id="custom-report-name"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. East coast funnel"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="custom-report-base">Based on</Label>
              <select
                id="custom-report-base"
                className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                value={newBasedOn}
                onChange={(e) => setNewBasedOn(e.target.value as ReportId)}
              >
                {REPORT_CATALOG.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => {
                const title = newTitle.trim();
                if (!title) {
                  toast.error('Give the report a name');
                  return;
                }
                const base = REPORT_CATALOG.find((r) => r.id === newBasedOn)!;
                const row: CustomReport = {
                  id: `custom-${Date.now()}`,
                  title,
                  basedOn: newBasedOn,
                  category: base.category,
                };
                const next = [...custom, row];
                setCustom(next);
                saveCustom(next);
                setNewTitle('');
                setCreateOpen(false);
                toast.success('Custom report saved');
              }}
            >
              Save report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const TAB_FOR_REPORT: Partial<Record<ReportId, string>> = {
  funnel: 'pipeline',
  'pipeline-health': 'jobs',
  'candidates-added': 'overview',
  source: 'sources',
  'recruiter-activity': 'activity',
  'client-scorecard': 'companies',
};

function ReportDetail({ stats, id }: { stats: ReportingStats; id: ReportId }) {
  const tab = TAB_FOR_REPORT[id];
  if (tab) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">
          This report lives on the {tab} analytics tab so the numbers stay in
          one place.
        </p>
        <Link
          href={`?tab=${tab}`}
          className="mt-3 inline-flex text-sm font-medium text-blue-700 hover:underline"
        >
          Open {tab} analytics →
        </Link>
      </div>
    );
  }
  if (id === 'time-to-fill') {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          {
            label: 'Avg time to fill',
            value: stats.avgTimeToFill || 0,
            sub: 'Days, open job to placement',
          },
          {
            label: 'Avg time to hire',
            value: stats.avgTimeToHire || 0,
            sub: 'Days, candidate to placed',
          },
          {
            label: 'Open jobs',
            value: stats.openJobs,
            sub: `${stats.jobs.emptyOpen} empty pipelines`,
          },
          {
            label: 'Placements',
            value: stats.placementsKpi.value,
            sub: stats.periodLabel,
          },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm"
          >
            <div className="text-2xl font-semibold tabular-nums text-slate-900">
              {c.value}
            </div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              {c.label}
            </div>
            <div className="text-[11px] text-slate-400">{c.sub}</div>
          </div>
        ))}
      </div>
    );
  }
  if (id === 'leaderboard') return <LeaderboardReport stats={stats} />;
  if (id === 'goals') return <GoalsReport stats={stats} />;
  if (id === 'digest') return <DigestReport />;
  if (id === 'revenue' || id === 'commission') {
    return <FinanceReport kind={id} />;
  }
  return null;
}

function LeaderboardReport({ stats }: { stats: ReportingStats }) {
  const rows = Object.values(
    stats.recentEvents.reduce<
      Record<string, { name: string; events: number }>
    >((acc, ev) => {
      const name = (ev.createdBy || 'Unassigned').trim() || 'Unassigned';
      acc[name] = acc[name] || { name, events: 0 };
      acc[name].events += 1;
      return acc;
    }, {})
  ).sort((a, b) => b.events - a.events);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Rank
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Recruiter
            </th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Activity
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-4 py-10 text-center text-slate-500">
                No recruiter activity in this window yet.
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={row.name}>
                <td className="px-4 py-3 tabular-nums text-slate-500">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">{row.events}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function GoalsReport({ stats }: { stats: ReportingStats }) {
  const [goal, setGoal] = useState(10);
  useEffect(() => {
    const raw = localStorage.getItem(GOALS_KEY);
    const n = raw ? Number(raw) : 10;
    if (Number.isFinite(n) && n > 0) setGoal(n);
  }, []);
  const placed = stats.placementsKpi.value;
  const pct = goal > 0 ? Math.min(100, Math.round((placed / goal) * 100)) : 0;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-600">Placement goal</p>
            <p className="text-3xl font-semibold tabular-nums text-slate-900">
              {placed}
              <span className="text-lg font-medium text-slate-400"> / {goal}</span>
            </p>
            <p className="mt-1 text-sm text-slate-500">{pct}% to goal this period</p>
          </div>
          <div className="w-40 space-y-1">
            <Label htmlFor="placement-goal">Target</Label>
            <Input
              id="placement-goal"
              type="number"
              min={1}
              value={goal}
              onChange={(e) => {
                const n = Math.max(1, Number(e.target.value) || 1);
                setGoal(n);
                localStorage.setItem(GOALS_KEY, String(n));
              }}
            />
          </div>
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function DigestReport() {
  const [cadence, setCadence] = useState('weekly');
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DIGEST_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.cadence) setCadence(parsed.cadence);
      }
    } catch {
      /* ignore */
    }
  }, []);
  return (
    <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-600">
        Email delivery is not wired yet. Save a cadence here and we will use it
        when inbox send is enabled.
      </p>
      <div className="mt-4 space-y-1.5">
        <Label htmlFor="digest-cadence">Cadence</Label>
        <select
          id="digest-cadence"
          className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
          value={cadence}
          onChange={(e) => {
            setCadence(e.target.value);
            localStorage.setItem(
              DIGEST_KEY,
              JSON.stringify({ cadence: e.target.value })
            );
            toast.success('Digest cadence saved');
          }}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>
    </div>
  );
}

function FinanceReport({ kind }: { kind: 'revenue' | 'commission' }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    fetch('/api/invoices', { credentials: 'include' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Could not load invoices (${res.status})`);
        return Array.isArray(data.invoices) ? data.invoices : [];
      })
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setRows([]);
          setError(err?.message || 'Invoices are not available');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const billed = (rows || [])
    .filter((i) => i.status === 'paid' || i.status === 'sent')
    .reduce((sum, i) => sum + Number(i.total || 0), 0);
  const pending = (rows || [])
    .filter((i) => i.status === 'draft' || i.status === 'sent')
    .reduce((sum, i) => sum + Number(i.total || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
          <div className="text-2xl font-semibold tabular-nums text-slate-900">
            {formatMoney(billed)}
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            {kind === 'commission' ? 'Eligible fees' : 'Billed / sent'}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
          <div className="text-2xl font-semibold tabular-nums text-slate-900">
            {formatMoney(pending)}
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Pipeline / unpaid
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
          <div className="text-2xl font-semibold tabular-nums text-slate-900">
            {(rows || []).length}
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Invoices
          </div>
        </div>
      </div>
      {error ? (
        <p className="text-sm text-slate-500">{error}</p>
      ) : rows == null ? (
        <p className="text-sm text-slate-500">Loading invoices…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          No invoices yet. Create one from a job or company to populate this report.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Invoice
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Client
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.slice(0, 25).map((inv) => (
                <tr key={inv.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {inv.invoice_number || inv.id}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{inv.client_name}</td>
                  <td className="px-4 py-3 capitalize text-slate-600">{inv.status}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(Number(inv.total || 0), inv.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

