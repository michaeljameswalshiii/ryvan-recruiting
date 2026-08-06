/**
 * Main dashboard home — operational snapshot of recruiting health.
 * Layout matches the TRIO pulse design: KPIs → Insights → trends →
 * Active jobs + On Deck → Top sources + Funnel.
 */

'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { ReportingStats, PeriodKey } from '@/lib/aws/reporting';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Users,
  Briefcase,
  Building2,
  Target,
  TrendingUp,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ChevronDown,
} from 'lucide-react';
import { DeskNextActions } from '@/components/desk/DeskNextActions';
import { DashboardCard } from '@/components/dashboard/DashboardCard';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#64748b'];

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '7', label: '7d' },
  { key: '30', label: '30d' },
  { key: '90', label: '90d' },
  { key: 'ytd', label: 'YTD' },
];

function DeltaBadge({ deltaPct }: { deltaPct: number | null }) {
  // Hide when we have no prior baseline (avoids noisy "− n/a")
  if (deltaPct === null) {
    return <span className="h-4" aria-hidden />;
  }
  if (deltaPct === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-slate-700">
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

function toDisplayTrend(
  series: Array<{ date: string; count: number }>
): Array<{ date: string; count: number }> {
  const trend = series.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    count: d.count,
  }));
  if (trend.length > 45) return trend.filter((_, i) => i % 3 === 0);
  if (trend.length > 20) return trend.filter((_, i) => i % 2 === 0);
  return trend;
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
  const [insightsOpen, setInsightsOpen] = useState(false);

  const setPeriod = (key: PeriodKey) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('period', key);
    router.push(`${pathname}?${next.toString()}`);
  };

  const candidatesTrend = useMemo(
    () => toDisplayTrend(stats.candidatesOverTime),
    [stats.candidatesOverTime]
  );
  const companiesTrend = useMemo(
    () => toDisplayTrend(stats.companiesOverTime || []),
    [stats.companiesOverTime]
  );

  const funnelMax = Math.max(...stats.funnel.map((f) => f.count), 1);

  // KPI set: Interviews · Open jobs · New candidates · New companies · Placements
  // (same card chrome; metrics + drill links aligned to each page)
  const kpis = [
    {
      title: 'Interviews',
      value: stats.interviewsKpi?.value ?? stats.interviews ?? 0,
      delta: stats.interviewsKpi?.deltaPct ?? null,
      sub: `${stats.inMotion} in motion`,
      icon: Users,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
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
      title: 'New companies',
      value: stats.companiesAddedKpi?.value ?? 0,
      delta: stats.companiesAddedKpi?.deltaPct ?? null,
      sub: `${stats.companies.closedWon} closed won`,
      icon: Building2,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      href: '/dashboard/companies',
    },
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
  ];

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="mt-0.5 text-sm font-medium text-slate-600 dark:text-slate-300">
            Recruiting pulse for {stats.periodLabel}. KPI cards drill into detail.
          </p>
        </div>
        <div className="surface-light inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm self-start">
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
                    : 'text-slate-700 hover:bg-gray-50'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {kpis.map((c) => (
          <DashboardCard
            key={c.title}
            title={c.title}
            className="overflow-hidden"
            expandedChildren={
              <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
                <div className={`mb-5 rounded-2xl p-4 ${c.bg}`}>
                  <c.icon className={`h-8 w-8 ${c.color}`} />
                </div>
                <div className="text-6xl font-semibold tabular-nums text-slate-900">
                  {Number(c.value).toLocaleString()}
                </div>
                <p className="mt-3 text-sm font-medium text-slate-600">{c.sub}</p>
                <div className="mt-4 flex items-center gap-3 text-sm text-slate-500">
                  <span>Compared with the prior period</span>
                  <DeltaBadge deltaPct={c.delta} />
                </div>
                <Link href={c.href} className="mt-8 text-sm font-semibold text-blue-600 hover:underline">
                  Open {c.title.toLowerCase()} details
                </Link>
              </div>
            }
          >
          <Link href={c.href} className="block hover:opacity-90 transition-opacity">
            <div className="flex items-start justify-between gap-2">
              <div className={`p-2 rounded-xl ${c.bg}`}>
                <c.icon className={`h-4 w-4 ${c.color}`} />
              </div>
              <DeltaBadge deltaPct={c.delta} />
            </div>
            <div className="mt-3 text-2xl font-semibold tabular-nums text-slate-900">
              {Number(c.value).toLocaleString()}
            </div>
            <div className="mt-0.5 truncate text-[11px] font-medium text-slate-600">
              {c.sub}
            </div>
          </Link>
          </DashboardCard>
        ))}
      </div>

      {/* Insights — header only by default; hover or click for the full list (weekly scan, not daily noise) */}
      {stats.insights.length > 0 && (
        <div
          className="relative z-20"
          onMouseEnter={() => setInsightsOpen(true)}
          onMouseLeave={() => setInsightsOpen(false)}
        >
          <button
            type="button"
            onClick={() => setInsightsOpen((o) => !o)}
            aria-expanded={insightsOpen}
            aria-controls="dashboard-insights-panel"
            data-ink-on-light
            className="surface-light flex w-full items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
          >
            <Sparkles className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
            <span className="text-sm font-semibold uppercase tracking-wide text-slate-900">
              Insights
            </span>
            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-blue-800">
              {stats.insights.length}
            </span>
            <span className="ml-auto hidden text-[11px] font-semibold text-slate-600 sm:inline">
              {insightsOpen ? 'Hide' : 'Hover or click to review'}
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-slate-700 transition-transform ${
                insightsOpen ? 'rotate-180' : ''
              }`}
              aria-hidden
            />
          </button>

          {insightsOpen && (
            <div
              id="dashboard-insights-panel"
              role="region"
              aria-label="Dashboard insights"
              className="absolute left-0 right-0 top-full z-30 mt-1"
            >
              {/* Stay white in both themes — never dark:bg-card (dark ink on charcoal) */}
              <ul
                data-ink-on-light
                data-popover-surface
                className="surface-light max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-blue-200 bg-white p-3 shadow-lg"
              >
                {stats.insights.map((line, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-sm font-semibold text-slate-900"
                  >
                    <span className="shrink-0 font-bold text-blue-600">•</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Trend charts: candidates + companies */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardCard title="Candidates added">
          <p className="mb-2 text-xs text-gray-500">{stats.periodLabel}</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={candidatesTrend}>
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
        </DashboardCard>

        <DashboardCard title="Companies added">
          <p className="mb-2 text-xs text-gray-500">{stats.periodLabel}</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={companiesTrend}>
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
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.15}
                strokeWidth={2}
                name="New companies"
              />
            </AreaChart>
          </ResponsiveContainer>
        </DashboardCard>
      </div>

      {/* Active jobs + On Deck */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardCard title="Active jobs" defaultCollapsed>
          <div className="mb-3 flex items-center justify-between">
            <Link
              href="/dashboard/jobs"
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {stats.jobs.topJobs.slice(0, 6).map((job) => (
              <Link
                key={job.id}
                href={`/dashboard/jobs/${job.id}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2.5 hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-900">
                    {job.title}
                  </div>
                  <div className="truncate text-xs text-gray-500">
                    {job.companyName} · {job.status}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold tabular-nums text-gray-900">
                    {job.candidateCount}
                  </div>
                  <div className="text-[11px] text-gray-400">{job.daysOpen}d</div>
                </div>
              </Link>
            ))}
            {stats.jobs.topJobs.length === 0 && (
              <p className="py-8 text-center text-sm text-gray-500">No open jobs</p>
            )}
          </div>
        </DashboardCard>

        <DeskNextActions variant="onDeck" limit={8} />
      </div>

      {/* Top sources + funnel */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardCard title="Top sources" defaultCollapsed>
          <div className="space-y-2">
            {stats.sources.slice(0, 5).map((s) => (
              <div
                key={s.source}
                className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-900">
                    {s.label}
                  </div>
                  <div className="text-xs text-gray-500">
                    {s.placementRate}% placed · {s.interviewRate}% interview+
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {s.count}
                </span>
              </div>
            ))}
            {stats.sources.length === 0 && (
              <p className="py-8 text-center text-sm text-gray-500">
                No source data yet
              </p>
            )}
          </div>
        </DashboardCard>

        <DashboardCard title="Candidate funnel" defaultCollapsed>
          <div className="mb-4 flex items-center justify-between">
            <div>
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
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {step.label}
                      </span>
                      {step.conversionFromPrev !== null && (
                        <span className="text-[11px] text-gray-400">
                          {step.conversionFromPrev}% from prior
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 tabular-nums text-gray-600">
                      {step.count.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
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
        </DashboardCard>
      </div>
    </div>
  );
}
