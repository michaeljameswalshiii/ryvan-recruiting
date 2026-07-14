/**
 * Main dashboard home — operational snapshot of recruiting health.
 * Uses the same insight engine as Reporting.
 */

'use client';

import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { ReportingStats, PeriodKey, AttentionItem } from '@/lib/aws/reporting';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import {
  Users,
  Briefcase,
  Building2,
  Target,
  Clock,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  UserRound,
  Mail,
  BarChart3,
  Plus,
  ChevronRight,
  Activity,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '7', label: '7d' },
  { key: '30', label: '30d' },
  { key: '90', label: '90d' },
  { key: 'ytd', label: 'YTD' },
];

function DeltaBadge({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-gray-400">
        <Minus className="h-3 w-3" /> n/a
      </span>
    );
  }
  if (deltaPct === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-gray-500">
        <Minus className="h-3 w-3" /> 0%
      </span>
    );
  }
  if (deltaPct > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-600">
        <ArrowUpRight className="h-3 w-3" /> {deltaPct}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-rose-600">
      <ArrowDownRight className="h-3 w-3" /> {Math.abs(deltaPct)}%
    </span>
  );
}

function severityClass(sev: AttentionItem['severity']) {
  if (sev === 'high') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (sev === 'medium') return 'bg-amber-50 text-amber-800 border-amber-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

function typeIcon(type: AttentionItem['type']) {
  if (type === 'job') return Briefcase;
  if (type === 'company') return Building2;
  return UserRound;
}

export function DashboardHome({
  stats,
  period,
}: {
  stats: ReportingStats;
  period: PeriodKey;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setPeriod = (key: PeriodKey) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('period', key);
    router.push(`${pathname}?${next.toString()}`);
  };

  const trend = stats.candidatesOverTime.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    count: d.count,
  }));
  const displayTrend =
    trend.length > 45
      ? trend.filter((_, i) => i % 3 === 0)
      : trend.length > 20
        ? trend.filter((_, i) => i % 2 === 0)
        : trend;

  const funnelMax = Math.max(...stats.funnel.map((f) => f.count), 1);

  const jobStatusChart = [
    { name: 'Open', count: stats.jobs.open, fill: '#10b981' },
    { name: 'Hold', count: stats.jobs.onHold, fill: '#f59e0b' },
    { name: 'Closed', count: stats.jobs.closed, fill: '#94a3b8' },
  ];

  const kpis = [
    {
      title: 'Placements',
      value: stats.placementsKpi.value,
      delta: stats.placementsKpi.deltaPct,
      sub: `vs prior (${stats.placementsKpi.previous})`,
      icon: Target,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      href: '/dashboard/candidates',
    },
    {
      title: 'Open jobs',
      value: stats.openJobs,
      delta: stats.openJobsKpi.deltaPct,
      sub: `${stats.jobs.emptyOpen} empty pipelines`,
      icon: Briefcase,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      href: '/dashboard/jobs',
    },
    {
      title: 'In motion',
      value: stats.inMotion,
      delta: null as number | null,
      sub: `${stats.totalCandidates} total candidates`,
      icon: Users,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      href: '/dashboard/candidates',
    },
    {
      title: 'New candidates',
      value: stats.candidatesAddedKpi.value,
      delta: stats.candidatesAddedKpi.deltaPct,
      sub: stats.periodLabel,
      icon: TrendingUp,
      color: 'text-sky-600',
      bg: 'bg-sky-50',
      href: '/dashboard/candidates',
    },
    {
      title: 'Companies',
      value: stats.companies.total,
      delta: null as number | null,
      sub: `${stats.companies.closedWon} closed won`,
      icon: Building2,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      href: '/dashboard/companies',
    },
    {
      title: 'Time to hire',
      value: stats.avgTimeToHire > 0 ? `${stats.avgTimeToHire}d` : '—',
      delta: null as number | null,
      sub:
        stats.avgTimeToFill > 0
          ? `Fill avg ${stats.avgTimeToFill}d`
          : 'Avg for placed',
      icon: Clock,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      href: '/dashboard/reporting',
      isString: true,
    },
  ];

  const quickLinks = [
    {
      href: '/dashboard/candidates/new',
      label: 'Add candidate',
      desc: 'Source or create',
      icon: Users,
      color: 'bg-blue-50 text-blue-700',
    },
    {
      href: '/dashboard/jobs',
      label: 'Jobs pipeline',
      desc: `${stats.jobs.open} open`,
      icon: Briefcase,
      color: 'bg-emerald-50 text-emerald-700',
    },
    {
      href: '/dashboard/companies',
      label: 'Companies',
      desc: `${stats.companies.total} accounts`,
      icon: Building2,
      color: 'bg-violet-50 text-violet-700',
    },
    {
      href: '/dashboard/contact-info',
      label: 'Contacts',
      desc: 'People directory',
      icon: Mail,
      color: 'bg-sky-50 text-sky-700',
    },
    {
      href: '/dashboard/reporting',
      label: 'Full reporting',
      desc: 'Deep analytics',
      icon: BarChart3,
      color: 'bg-amber-50 text-amber-800',
    },
    {
      href: '/dashboard/candidates',
      label: 'Candidates',
      desc: `${stats.inMotion} in motion`,
      icon: UserRound,
      color: 'bg-rose-50 text-rose-700',
    },
  ];

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Dashboard
          </h1>
          <p className="text-sm text-gray-500">
            Your recruiting pulse — {stats.periodLabel}. Click any card to drill in.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
            {PERIODS.map((p) => {
              const active = period === p.key;
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
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => router.push('/dashboard/candidates/new')}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add candidate
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map((c) => (
          <Link
            key={c.title}
            href={c.href}
            className="rounded-2xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm hover:border-blue-200 hover:shadow transition-all"
          >
            <div className="flex items-start justify-between gap-2">
              <div className={`p-2 rounded-xl ${c.bg}`}>
                <c.icon className={`h-4 w-4 ${c.color}`} />
              </div>
              <DeltaBadge deltaPct={c.delta} />
            </div>
            <div className="mt-3 text-2xl font-semibold tabular-nums text-gray-900">
              {c.isString ? c.value : Number(c.value).toLocaleString()}
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 mt-1">
              {c.title}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5 truncate">{c.sub}</div>
          </Link>
        ))}
      </div>

      {/* Insights */}
      {stats.insights.length > 0 && (
        <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50/80 to-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-gray-900">Insights</h2>
            </div>
            <Link
              href={`/dashboard/reporting?period=${period}`}
              className="text-xs font-medium text-blue-600 hover:underline inline-flex items-center"
            >
              Full reporting <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <ul className="space-y-1.5">
            {stats.insights.map((line, i) => (
              <li key={i} className="text-sm text-gray-700 flex gap-2">
                <span className="text-blue-500 font-bold shrink-0">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {quickLinks.map((q) => (
          <Link
            key={q.href + q.label}
            href={q.href}
            className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:border-blue-200 hover:shadow transition-all group"
          >
            <div
              className={`h-10 w-10 rounded-xl flex items-center justify-center ${q.color}`}
            >
              <q.icon className="h-5 w-5" />
            </div>
            <div className="mt-3 text-sm font-semibold text-gray-900 group-hover:text-blue-700">
              {q.label}
            </div>
            <div className="text-xs text-gray-500">{q.desc}</div>
          </Link>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Funnel */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Candidate funnel
              </h2>
              <p className="text-xs text-gray-500">
                Reached stage or beyond · conversion between steps
              </p>
            </div>
            <Link
              href="/dashboard/candidates"
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {stats.funnel.map((step, i) => {
              const width = Math.max(8, Math.round((step.count / funnelMax) * 100));
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
          </div>
        </div>

        {/* Needs attention */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Needs attention
                </h2>
                <p className="text-xs text-gray-500">
                  Empty jobs, stalled candidates, incomplete accounts
                </p>
              </div>
            </div>
            <Link
              href={`/dashboard/reporting?period=${period}&tab=activity`}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              See all
            </Link>
          </div>
          <div className="space-y-2 max-h-[320px] overflow-y-auto">
            {stats.needsAttention.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-10">
                Nothing urgent — pipeline looks healthy.
              </p>
            ) : (
              stats.needsAttention.slice(0, 8).map((item) => {
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
                          className={`text-[10px] uppercase font-semibold rounded-full border px-1.5 py-0.5 ${severityClass(item.severity)}`}
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
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Candidates added
              </h2>
              <p className="text-xs text-gray-500">{stats.periodLabel}</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={displayTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
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
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Jobs by status</h2>
              <p className="text-xs text-gray-500">
                {stats.jobs.avgCandidatesPerOpen} avg candidates per open job
              </p>
            </div>
            <Link
              href="/dashboard/jobs"
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              Manage jobs
            </Link>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={jobStatusChart}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {jobStatusChart.map((e, i) => (
                  <Cell key={i} fill={e.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom: top jobs + activity + sources */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Top jobs */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">Active jobs</h2>
            <Link
              href="/dashboard/jobs"
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {stats.jobs.topJobs.slice(0, 5).map((job) => (
              <Link
                key={job.id}
                href={`/dashboard/jobs/${job.id}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2 hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {job.title}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {job.companyName} · {job.status}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold tabular-nums">
                    {job.candidateCount}
                  </div>
                  <div className="text-[11px] text-gray-400">{job.daysOpen}d</div>
                </div>
              </Link>
            ))}
            {stats.jobs.topJobs.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">No jobs yet</p>
            )}
          </div>
        </div>

        {/* Sources snapshot */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">Top sources</h2>
            <Link
              href={`/dashboard/reporting?period=${period}&tab=sources`}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              Quality view
            </Link>
          </div>
          <div className="space-y-2">
            {stats.sources.slice(0, 5).map((s) => (
              <div
                key={s.source}
                className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {s.label}
                  </div>
                  <div className="text-xs text-gray-500">
                    {s.placementRate}% placed · {s.interviewRate}% interview+
                  </div>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">
                  {s.count}
                </span>
              </div>
            ))}
            {stats.sources.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">
                No source data yet
              </p>
            )}
          </div>
        </div>

        {/* Recent activity */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-600" />
              <h2 className="text-base font-semibold text-gray-900">
                Recent activity
              </h2>
            </div>
            <Link
              href={`/dashboard/reporting?period=${period}&tab=activity`}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              More
            </Link>
          </div>
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {stats.recentEvents.slice(0, 8).map((ev) => (
              <Link
                key={`${ev.id}-${ev.createdAt}`}
                href={ev.href || `/dashboard/candidates/${ev.candidateId}`}
                className="block rounded-xl border border-gray-100 px-3 py-2 hover:bg-gray-50"
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
                </div>
              </Link>
            ))}
            {stats.recentEvents.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">
                No recent events
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Company snapshot strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: 'Companies',
            value: stats.companies.total,
            sub: 'Total accounts',
            href: '/dashboard/companies',
          },
          {
            label: 'Closed won',
            value: stats.companies.closedWon,
            sub: 'Clients',
            href: '/dashboard/companies',
          },
          {
            label: 'No contacts',
            value: stats.companies.noContacts,
            sub: 'Needs people',
            href: '/dashboard/contact-info',
          },
          {
            label: 'No open jobs',
            value: stats.companies.noOpenJobs,
            sub: 'No active reqs',
            href: '/dashboard/jobs',
          },
        ].map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-2xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm hover:border-blue-200 transition-all"
          >
            <div className="text-2xl font-semibold tabular-nums text-gray-900">
              {c.value}
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 mt-1">
              {c.label}
            </div>
            <div className="text-[11px] text-gray-400">{c.sub}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
