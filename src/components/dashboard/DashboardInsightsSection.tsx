'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowUpRight, Building2, CalendarDays, Check, ChevronDown, MoreHorizontal, UserRound } from 'lucide-react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ReportingStats } from '@/lib/aws/reporting';
import { toDisplayTrend } from '@/lib/reporting/display-trend';

const BLUE = '#2563eb';
const GREEN = '#16a34a';

function formatRelative(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function trendValue(delta: number | null) {
  if (delta === null) return '—';
  return `${delta > 0 ? '+' : ''}${delta}%`;
}

function StatusChip({ tone, children }: { tone: 'green' | 'blue' | 'muted'; children: ReactNode }) {
  const styles = {
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    muted: 'border-slate-200 bg-slate-50 text-slate-600',
  }[tone];
  return <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[10px] font-semibold ${styles}`}>{children}</span>;
}

function SummaryCard({
  title,
  count,
  delta,
  subtitle,
  data,
  color,
  icon: Icon,
}: {
  title: string;
  count: number;
  delta: number | null;
  subtitle: string;
  data: Array<{ date: string; count: number }>;
  color: string;
  icon: typeof UserRound;
}) {
  return (
    <section className="surface-light overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(30,41,59,0.04)]">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-50 text-violet-600"><Icon className="h-3.5 w-3.5" /></span>
          <div>
            <h3 className="text-xs font-bold text-slate-900">{title}</h3>
            <p className="text-[10px] text-slate-500">Last 30 days</p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-slate-400"><ChevronDown className="h-3.5 w-3.5" /><MoreHorizontal className="h-3.5 w-3.5" /></div>
      </div>
      <div className="grid min-h-[164px] grid-cols-[112px_1fr] items-center gap-2 px-4 py-3">
        <div>
          <div className="text-3xl font-bold tracking-tight text-slate-950">{count.toLocaleString()}</div>
          <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><ArrowUpRight className="h-3 w-3" />{trendValue(delta)}</div>
          <p className="mt-2 text-[10px] leading-4 text-slate-500">{subtitle}</p>
        </div>
        <div className="h-24 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 10 }} />
              <XAxis dataKey="date" hide />
              <YAxis hide domain={[0, 'dataMax + 1']} />
              <Area type="monotone" dataKey="count" stroke={color} fill={color} fillOpacity={0.12} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

function ActivityRow({ title, description, href, createdAt, kind }: { title: string; description?: string; href?: string; createdAt?: string; kind: 'candidate' | 'company' }) {
  const content = (
    <div className="group flex items-center gap-3 border-b border-violet-100/80 px-4 py-3 last:border-b-0 hover:bg-violet-50/40">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${kind === 'candidate' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'}`}>
        {kind === 'candidate' ? <UserRound className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-900">{title}</p>
        <p className="truncate text-[10px] text-slate-500">{description || (kind === 'candidate' ? 'Candidate activity' : 'Company activity')}</p>
      </div>
      <span className="hidden shrink-0 text-[10px] text-slate-400 sm:block">{createdAt ? formatRelative(createdAt) : 'Recently'}</span>
      <StatusChip tone="green"><Check className="mr-1 h-3 w-3" />Complete</StatusChip>
      <StatusChip tone="muted">More</StatusChip>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export function DashboardInsightsSection({ stats }: { stats: ReportingStats }) {
  const candidateRows = stats.recentEvents.slice(0, 4).map((event) => ({ ...event, kind: 'candidate' as const }));
  const companyRows = stats.needsAttention.filter((item) => item.type === 'company').slice(0, 3).map((item) => ({
    title: item.title,
    description: item.reason,
    href: item.href,
    createdAt: undefined,
    kind: 'company' as const,
  }));
  const overdue = stats.needsAttention.filter((item) => item.days >= 30).length;
  const dueToday = stats.needsAttention.filter((item) => item.days < 1).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400"><span>Insights</span><span>/</span><span className="text-violet-500">Dashboard</span></div>
      <section className="surface-light rounded-xl border border-violet-200 bg-[#f8f5ff] shadow-[0_2px_8px_rgba(109,40,217,0.05)]">
        <div className="flex flex-col gap-3 border-b border-violet-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-violet-600" /><span className="text-xs font-bold text-slate-900">To-do</span><span className="text-[10px] text-slate-500">{stats.periodLabel}</span></div>
          <div className="flex flex-wrap gap-1.5"><StatusChip tone="blue">{overdue} overdue</StatusChip><StatusChip tone="muted">{dueToday} due today</StatusChip><StatusChip tone="green">{stats.needsAttention.length} to review</StatusChip></div>
        </div>
        <div className="grid gap-3 p-3 lg:grid-cols-2">
          <SummaryCard title="Candidates added" count={stats.candidatesAddedKpi.value} delta={stats.candidatesAddedKpi.deltaPct} subtitle="New candidates entering the pipeline" data={toDisplayTrend(stats.candidatesOverTime)} color={BLUE} icon={UserRound} />
          <SummaryCard title="Companies added" count={stats.companiesAddedKpi.value} delta={stats.companiesAddedKpi.deltaPct} subtitle="New companies added to the CRM" data={toDisplayTrend(stats.companiesOverTime)} color={GREEN} icon={Building2} />
        </div>
      </section>

      <section className="surface-light overflow-hidden rounded-xl border border-violet-200 bg-white shadow-[0_2px_8px_rgba(109,40,217,0.05)]">
        <div className="flex items-center justify-between border-b border-violet-100 bg-[#fbfaff] px-4 py-3"><div><h2 className="text-xs font-bold text-slate-900">Candidates added</h2><p className="text-[10px] text-slate-500">{stats.periodLabel}</p></div><span className="text-[10px] font-semibold text-violet-600">View all activity</span></div>
        {candidateRows.length ? candidateRows.map((row) => <ActivityRow key={row.id} {...row} />) : <p className="px-4 py-8 text-center text-xs text-slate-500">No candidate activity in this period.</p>}
      </section>

      <section className="surface-light overflow-hidden rounded-xl border border-violet-200 bg-white shadow-[0_2px_8px_rgba(109,40,217,0.05)]">
        <div className="flex items-center justify-between border-b border-violet-100 bg-[#fbfaff] px-4 py-3"><div><h2 className="text-xs font-bold text-slate-900">Companies added</h2><p className="text-[10px] text-slate-500">{stats.periodLabel}</p></div><span className="text-[10px] font-semibold text-violet-600">View all activity</span></div>
        {companyRows.length ? companyRows.map((row, index) => <ActivityRow key={`${row.title}-${index}`} {...row} />) : <p className="px-4 py-8 text-center text-xs text-slate-500">No company activity in this period.</p>}
      </section>
    </div>
  );
}
