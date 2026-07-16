/**
 * Dashboard home — live recruiting pulse powered by the reporting insight engine.
 */

import { Suspense } from 'react';
import { getReportingStats, type PeriodKey } from '@/lib/aws/reporting';
import { DashboardHome } from '@/components/dashboard/DashboardHome';

export const dynamic = 'force-dynamic';

function parsePeriod(raw?: string): PeriodKey {
  if (raw === '7' || raw === '30' || raw === '90' || raw === 'ytd') return raw;
  return '30';
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 max-w-7xl animate-pulse">
      <div className="h-10 w-72 bg-gray-100 rounded-xl" />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-28 bg-gray-100 rounded-2xl" />
        ))}
      </div>
      <div className="h-24 bg-gray-100 rounded-2xl" />
      <div className="grid md:grid-cols-2 gap-4">
        <div className="h-72 bg-gray-100 rounded-2xl" />
        <div className="h-72 bg-gray-100 rounded-2xl" />
      </div>
    </div>
  );
}

async function DashboardBody({ period }: { period: PeriodKey }) {
  const stats = await getReportingStats(period);
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardHome stats={stats} period={period} />
    </Suspense>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?:
    | Promise<{ period?: string }>
    | { period?: string };
}) {
  const params =
    searchParams instanceof Promise ? await searchParams : searchParams;
  const period = parsePeriod(params?.period);

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardBody period={period} />
    </Suspense>
  );
}
