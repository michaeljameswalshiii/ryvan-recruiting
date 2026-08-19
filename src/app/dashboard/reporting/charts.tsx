/**
 * Reporting dashboard UI — insight-first Recharts + tables.
 */

'use client';

import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type {
  ReportingStats,
  FunnelStep,
  SourceQuality,
  AttentionItem,
  PeriodKey,
} from '@/lib/aws/reporting';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Cell,
  Legend,
} from 'recharts';
import {
  Briefcase,
  AlertTriangle,
  Building2,
  Sparkles,
  Activity,
  UserRound,
  Send,
  FileText,
  UserPlus,
  Calendar,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toDisplayTrend } from '@/lib/reporting/display-trend';
import { Badge } from '@/components/ui/badge';
import { ReportLibrary } from '@/components/reporting/ReportLibrary';
import { Button } from '@/components/ui/button';

const COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
  '#ef4444',
  '#ec4899',
  '#84cc16',
];

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '7', label: '7d' },
  { key: '30', label: '30d' },
  { key: '90', label: '90d' },
  { key: 'ytd', label: 'YTD' },
];

function severityBadge(sev: AttentionItem['severity']) {
  if (sev === 'high')
    return 'bg-rose-50 text-rose-700 border-rose-200';
  if (sev === 'medium')
    return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

function typeIcon(type: AttentionItem['type']) {
  if (type === 'job') return Briefcase;
  if (type === 'company') return Building2;
  return UserRound;
}

// ─── Period selector ─────────────────────────────────────────────────────────

export function PeriodSelector({ current }: { current: PeriodKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setPeriod = (key: PeriodKey) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('period', key);
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
      {PERIODS.map((p) => {
        const active = current === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              active
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── KPI row ─────────────────────────────────────────────────────────────────

export function KPICards({ stats }: { stats: ReportingStats }) {
  const submitted = stats.submittedKpi?.value ?? 0;
  const offers = stats.offersKpi?.value ?? 0;
  const cards = [
    {
      title: 'Open Jobs',
      value: stats.openJobs,
      sub: `${stats.jobs.emptyOpen} empty pipelines`,
      icon: Briefcase,
      href: '/dashboard/jobs',
      card: 'border-slate-200 bg-white',
      iconWrap: 'bg-slate-100 text-slate-600',
    },
    {
      title: 'Submittals',
      value: submitted,
      sub: `${submitted} currently submitted`,
      icon: Send,
      href: '/dashboard/candidates?stage=submitted',
      card: 'border-slate-200 bg-white',
      iconWrap: 'bg-slate-100 text-slate-600',
    },
    {
      title: 'Interviews',
      value: stats.interviewsKpi?.value ?? stats.interviews ?? 0,
      sub: `${stats.inMotion} in motion`,
      icon: Calendar,
      href: '/dashboard/candidates?stage=interviewing',
      card: 'border-slate-200 bg-white',
      iconWrap: 'bg-slate-100 text-slate-600',
    },
    {
      title: 'Offers',
      value: offers,
      sub: 'currently on offer',
      icon: FileText,
      href: '/dashboard/candidates?stage=offer_out',
      card: 'border-orange-100 bg-orange-50',
      iconWrap: 'bg-orange-100 text-orange-700',
    },
    {
      title: 'Placements',
      value: stats.placementsKpi.value,
      sub: `${stats.placementsKpi.previous} in prior period`,
      icon: UserPlus,
      href: '/dashboard/candidates?stage=placed',
      card: 'border-emerald-100 bg-emerald-50',
      iconWrap: 'bg-emerald-100 text-emerald-800',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      {cards.map((c) => (
        <Link
          key={c.title}
          href={c.href}
          data-ink-on-light
          className={`block rounded-2xl border px-4 py-3.5 shadow-sm transition-opacity hover:opacity-90 ${c.card}`}
        >
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">{c.title}</h2>
            <div className={`rounded-xl p-2 ${c.iconWrap}`}>
              <c.icon className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-semibold tabular-nums text-slate-900">
            {Number(c.value).toLocaleString()}
          </div>
          <div className="mt-1 truncate text-[12px] text-slate-500">{c.sub}</div>
        </Link>
      ))}
    </div>
  );
}

// ─── Insights strip ──────────────────────────────────────────────────────────

export function InsightsStrip({ insights }: { insights: string[] }) {
  if (!insights.length) return null;
  return (
    <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50/80 to-white p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-blue-600" />
        <h2 className="text-sm font-semibold text-gray-900">Insights</h2>
      </div>
      <ul className="space-y-1.5">
        {insights.map((line, i) => (
          <li key={i} className="text-sm text-gray-700 flex gap-2">
            <span className="text-blue-500 font-bold shrink-0">·</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Tabs shell ──────────────────────────────────────────────────────────────

const TABS = [
  { id: 'library', label: 'Library' },
  { id: 'overview', label: 'Overview' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'companies', label: 'Companies' },
  { id: 'sources', label: 'Sources' },
  { id: 'activity', label: 'Activity' },
] as const;

export type ReportingTab = (typeof TABS)[number]['id'];

export function ReportingTabs({
  active,
  stats,
  reportId,
}: {
  active: ReportingTab;
  stats: ReportingStats;
  reportId?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setTab = (id: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', id);
    if (id !== 'library') next.delete('report');
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                active === t.id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {active === 'library' && (
        <ReportLibrary stats={stats} reportId={reportId} />
      )}
      {active === 'overview' && <OverviewTab stats={stats} />}
      {active === 'pipeline' && <PipelineTab stats={stats} />}
      {active === 'jobs' && <JobsTab stats={stats} />}
      {active === 'companies' && <CompaniesTab stats={stats} />}
      {active === 'sources' && <SourcesTab stats={stats} />}
      {active === 'activity' && <ActivityTab stats={stats} />}
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

export function OverviewTab({ stats }: { stats: ReportingStats }) {
  const displayTrend = toDisplayTrend(stats.candidatesOverTime);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <FunnelCard funnel={stats.funnel} />
        <Card className="rounded-2xl border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Candidates added</CardTitle>
            <CardDescription>{stats.periodLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={displayTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.15}
                  strokeWidth={2}
                  name="New candidates"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <JobHealthSummary stats={stats} />
        <NeedsAttentionCard items={stats.needsAttention.slice(0, 6)} />
      </div>
    </div>
  );
}

export function FunnelCard({ funnel }: { funnel: FunnelStep[] }) {
  const max = Math.max(...funnel.map((f) => f.count), 1);
  return (
    <Card className="rounded-2xl border-gray-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Candidate funnel</CardTitle>
        <CardDescription>Reached stage or beyond · conversion between steps</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {funnel.map((step, i) => {
          const width = Math.max(8, Math.round((step.count / max) * 100));
          return (
            <div key={step.key} className="space-y-1">
              <div className="flex items-center justify-between text-sm gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-gray-900">{step.label}</span>
                  {step.conversionFromPrev !== null && (
                    <span className="text-[11px] text-gray-400">
                      {step.conversionFromPrev}% from prior
                    </span>
                  )}
                </div>
                <span className="tabular-nums text-gray-600 shrink-0">
                  {step.count.toLocaleString()}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${width}%`,
                    backgroundColor: COLORS[i % COLORS.length],
                  }}
                />
              </div>
            </div>
          );
        })}
        <Link
          href="/dashboard/candidates"
          className="inline-block text-xs font-medium text-blue-600 hover:underline pt-1"
        >
          Open candidates →
        </Link>
      </CardContent>
    </Card>
  );
}

export function JobHealthSummary({ stats }: { stats: ReportingStats }) {
  const j = stats.jobs;
  const chips = [
    { label: 'Open', value: j.open, color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    { label: 'On hold', value: j.onHold, color: 'bg-amber-50 text-amber-800 border-amber-200' },
    { label: 'Closed', value: j.closed, color: 'bg-slate-50 text-slate-700 border-slate-200' },
    { label: 'Empty open', value: j.emptyOpen, color: 'bg-rose-50 text-rose-700 border-rose-200' },
  ];
  return (
    <Card className="rounded-2xl border-gray-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Jobs health</CardTitle>
        <CardDescription>
          Avg {j.avgCandidatesPerOpen} candidates per open job
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <span
              key={c.label}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${c.color}`}
            >
              {c.label}
              <span className="tabular-nums font-semibold">{c.value}</span>
            </span>
          ))}
        </div>
        <div className="space-y-2">
          {j.topJobs.slice(0, 5).map((job) => (
            <Link
              key={job.id}
              href={`/dashboard/jobs/${job.id}`}
              className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2 hover:bg-gray-50 transition-colors"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{job.title}</div>
                <div className="text-xs text-gray-500 truncate">
                  {job.companyName} · {job.status}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold tabular-nums">{job.candidateCount}</div>
                <div className="text-[11px] text-gray-400">{job.daysOpen}d</div>
              </div>
            </Link>
          ))}
          {j.topJobs.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-6">No jobs yet</p>
          )}
        </div>
        <Link href="/dashboard/jobs" className="text-xs font-medium text-blue-600 hover:underline">
          View all jobs →
        </Link>
      </CardContent>
    </Card>
  );
}

function NeedsAttentionCard({ items }: { items: AttentionItem[] }) {
  return (
    <Card className="rounded-2xl border-gray-200 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Needs attention
        </CardTitle>
        <CardDescription>Stalled candidates, empty jobs, incomplete accounts</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            Nothing urgent — pipeline looks healthy.
          </p>
        ) : (
          items.map((item) => {
            const Icon = typeIcon(item.type);
            return (
              <Link
                key={`${item.type}-${item.id}-${item.reason}`}
                href={item.href}
                className="flex items-start gap-3 rounded-xl border border-gray-100 px-3 py-2.5 hover:bg-gray-50 transition-colors"
              >
                <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-gray-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {item.title}
                    </span>
                    <span
                      className={`text-[10px] uppercase font-semibold rounded-full border px-1.5 py-0.5 ${severityBadge(item.severity)}`}
                    >
                      {item.severity}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {item.reason}
                    {item.subtitle ? ` · ${item.subtitle}` : ''}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

export function PipelineTab({ stats }: { stats: ReportingStats }) {
  const stageData = stats.pipelineByStage.slice(0, 10).map((s) => ({
    name: s.label.length > 14 ? s.label.slice(0, 12) + '…' : s.label,
    full: s.label,
    count: s.count,
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <FunnelCard funnel={stats.funnel} />
        <Card className="rounded-2xl border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Stage distribution</CardTitle>
            <CardDescription>Current candidate status (top 10)</CardDescription>
          </CardHeader>
          <CardContent>
            {stageData.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-16">No candidates</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stageData} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={100}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value) => [`${value} candidates`, 'Count']}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.full || ''
                    }
                  />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
      <NeedsAttentionCard
        items={stats.needsAttention.filter((i) => i.type === 'candidate')}
      />
    </div>
  );
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

export function JobsTab({ stats }: { stats: ReportingStats }) {
  const j = stats.jobs;
  const chartData = [
    { name: 'Open', count: j.open, fill: '#10b981' },
    { name: 'Paused', count: j.onHold, fill: '#f59e0b' },
    { name: 'Closed', count: j.closed, fill: '#94a3b8' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Open', value: j.open, sub: 'Actively hiring' },
          { label: 'Empty pipelines', value: j.emptyOpen, sub: '0 candidates' },
          { label: 'With pipeline', value: j.withCandidates, sub: 'Has candidates' },
          {
            label: 'Avg per open',
            value: j.avgCandidatesPerOpen,
            sub: 'Candidates / open job',
          },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm"
          >
            <div className="text-2xl font-semibold tabular-nums text-gray-900">{c.value}</div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 mt-1">
              {c.label}
            </div>
            <div className="text-[11px] text-gray-400">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Jobs by status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {chartData.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Jobs by pipeline size</CardTitle>
            <CardDescription>Most populated reqs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {j.topJobs.map((job) => (
              <Link
                key={job.id}
                href={`/dashboard/jobs/${job.id}`}
                className="flex justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2 hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{job.title}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {job.companyName} · open {job.daysOpen}d
                  </div>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">
                  {job.candidateCount}
                </span>
              </Link>
            ))}
            {j.topJobs.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-10">No jobs</p>
            )}
          </CardContent>
        </Card>
      </div>

      <NeedsAttentionCard items={stats.needsAttention.filter((i) => i.type === 'job')} />
    </div>
  );
}

// ─── Companies ───────────────────────────────────────────────────────────────

export function CompaniesTab({ stats }: { stats: ReportingStats }) {
  const c = stats.companies;
  const chartData = c.byStage.map((s) => ({
    name: s.label,
    count: s.count,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Companies', value: c.total, sub: 'Total accounts' },
          { label: 'Closed won', value: c.closedWon, sub: 'Clients' },
          { label: 'No contacts', value: c.noContacts, sub: 'Incomplete' },
          { label: 'No open jobs', value: c.noOpenJobs, sub: 'No active reqs' },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm"
          >
            <div className="text-2xl font-semibold tabular-nums text-gray-900">
              {card.value}
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 mt-1">
              {card.label}
            </div>
            <div className="text-[11px] text-gray-400">{card.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">BD pipeline stages</CardTitle>
            <CardDescription>Companies by status</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-16">No companies</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <NeedsAttentionCard
          items={stats.needsAttention.filter((i) => i.type === 'company')}
        />
      </div>

      <Link href="/dashboard/companies" className="text-sm font-medium text-blue-600 hover:underline">
        Open companies →
      </Link>
    </div>
  );
}

// ─── Sources ─────────────────────────────────────────────────────────────────

export function SourcesTab({ stats }: { stats: ReportingStats }) {
  const data = stats.sources.slice(0, 10);

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-gray-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Source quality</CardTitle>
          <CardDescription>
            Volume vs interview rate and placement rate (not just headcount)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-16">No source data</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data} margin={{ bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" name="Candidates" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="interviewing" name="Interview+" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="placed" name="Placed" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80">
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Source
              </th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Candidates
              </th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Interview+
              </th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Interview rate
              </th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Placed
              </th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Placement rate
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {stats.sources.map((s: SourceQuality) => (
              <tr key={s.source} className="hover:bg-gray-50/80">
                <td className="px-4 py-3 font-medium text-gray-900">{s.label}</td>
                <td className="px-4 py-3 text-right tabular-nums">{s.count}</td>
                <td className="px-4 py-3 text-right tabular-nums">{s.interviewing}</td>
                <td className="px-4 py-3 text-right tabular-nums">{s.interviewRate}%</td>
                <td className="px-4 py-3 text-right tabular-nums">{s.placed}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-700">
                  {s.placementRate}%
                </td>
              </tr>
            ))}
            {stats.sources.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                  No sources recorded
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Activity ────────────────────────────────────────────────────────────────

export function ActivityTab({ stats }: { stats: ReportingStats }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <NeedsAttentionCard items={stats.needsAttention} />
        <Card className="rounded-2xl border-gray-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-600" />
              Recent activity
            </CardTitle>
            <CardDescription>Latest candidate events</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[480px] overflow-y-auto">
            {stats.recentEvents.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-10">
                No recent events found
              </p>
            ) : (
              stats.recentEvents.map((ev) => (
                <Link
                  key={`${ev.id}-${ev.createdAt}`}
                  href={ev.href || `/dashboard/candidates/${ev.candidateId}`}
                  className="block rounded-xl border border-gray-100 px-3 py-2.5 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {ev.title}
                    </span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {ev.eventType}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {ev.createdAt
                      ? new Date(ev.createdAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : '—'}
                    {ev.createdBy ? ` · ${ev.createdBy}` : ''}
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
