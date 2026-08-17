/**
 * Reporting Dashboard
 * Insight-first analytics: funnel conversions, jobs/company health,
 * source quality, aging, and period comparisons.
 */

import { Suspense } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { getReportingStats, type PeriodKey } from '@/lib/aws/reporting';
import {
  KPICards,
  InsightsStrip,
  PeriodSelector,
  ReportingTabs,
  type ReportingTab,
} from './charts';

export const dynamic = 'force-dynamic';

function parsePeriod(raw?: string): PeriodKey {
  if (raw === '7' || raw === '30' || raw === '90' || raw === 'ytd') return raw;
  return '30';
}

function parseTab(raw?: string): ReportingTab {
  const valid: ReportingTab[] = [
    'overview',
    'pipeline',
    'jobs',
    'companies',
    'sources',
    'activity',
  ];
  if (raw && (valid as string[]).includes(raw)) return raw as ReportingTab;
  return 'overview';
}

function PageSkeleton() {
  return (
    <div className="space-y-5 max-w-7xl animate-pulse">
      <div className="h-10 w-64 bg-gray-100 rounded-xl" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-28 bg-gray-100 rounded-2xl" />
        ))}
      </div>
      <div className="h-24 bg-gray-100 rounded-2xl" />
      <div className="grid md:grid-cols-2 gap-4">
        <div className="h-80 bg-gray-100 rounded-2xl" />
        <div className="h-80 bg-gray-100 rounded-2xl" />
      </div>
    </div>
  );
}

async function ReportingBody({
  period,
  tab,
}: {
  period: PeriodKey;
  tab: ReportingTab;
}) {
  const stats = await getReportingStats(period);

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-blue-600" />
            Reporting
          </h1>
          <p className="text-sm text-gray-500">
            Pipeline outcomes, jobs health, and what needs attention —{' '}
            {stats.periodLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Suspense fallback={null}>
            <PeriodSelector current={period} />
          </Suspense>
          <span className="text-[11px] text-gray-400">
            Updated{' '}
            {new Date(stats.lastUpdated).toLocaleTimeString(undefined, {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        </div>
      </div>

      <KPICards stats={stats} />
      <InsightsStrip insights={stats.insights} />

      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-gray-500 py-8">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading tabs…
          </div>
        }
      >
        <ReportingTabs active={tab} stats={stats} />
      </Suspense>
    </div>
  );
}

export default async function ReportingDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const period = parsePeriod(params?.period);
  const tab = parseTab(params?.tab);

  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReportingBody period={period} tab={tab} />
    </Suspense>
  );
}
