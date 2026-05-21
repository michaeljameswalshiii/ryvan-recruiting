/**
 * Reporting Dashboard Page
 * 
 * Professional analytics dashboard with Recharts.
 * Tracks candidate pipeline metrics, conversions, and activity.
 * 
 * @serverOnly - Data fetched server-side
 */

import { Suspense } from 'react';
import { getReportingStats } from '@/lib/aws/reporting';
import { 
  BarChart3, 
  PieChart, 
  TrendingUp, 
  FileText,
  Users,
  Briefcase,
  Clock,
  RefreshCw,
  Calendar
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { 
  PipelineOverviewTab,
  PipelineFunnelChart,
  CandidatesOverTimeChart,
  StageDistributionChart,
  SourceBreakdownChart,
  RecentActivityTable,
  KPICards
} from './charts';

/**
 * Loading skeleton for the whole page
 */
function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-80 w-full" />
        ))}
      </div>
    </div>
  );
}

/**
 * Reporting Page
 */
export default async function ReportingDashboardPage() {
  // Fetch all reporting data server-side
  const stats = await getReportingStats();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-8 w-8" />
            Reporting
          </h1>
          <p className="text-muted-foreground">
            Unified analytics and pipeline insights
          </p>
        </div>
        
        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Calendar className="h-3 w-3" />
            {stats.periodLabel}
          </Badge>
        </div>
      </div>

      {/* KPI Cards */}
      <Suspense fallback={<PageSkeleton />}>
        <KPICards stats={stats} />
      </Suspense>

      {/* Main Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="pipeline">
            <TrendingUp className="h-4 w-4 mr-2" />
            Pipeline
          </TabsTrigger>
          <TabsTrigger value="sources">
            <Users className="h-4 w-4 mr-2" />
            Sources
          </TabsTrigger>
          <TabsTrigger value="activity">
            <Clock className="h-4 w-4 mr-2" />
            Activity
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <Suspense fallback={<PageSkeleton />}>
            <PipelineOverviewTab stats={stats} />
          </Suspense>
        </TabsContent>

        {/* Pipeline Tab */}
        <TabsContent value="pipeline" className="space-y-4">
          <Suspense fallback={<PageSkeleton />}>
            <div className="grid gap-4 md:grid-cols-2">
              <PipelineFunnelChart pipeline={stats.pipeline} />
              <StageDistributionChart pipeline={stats.pipeline} />
            </div>
            <CandidatesOverTimeChart candidates={stats.candidatesOverTime} />
          </Suspense>
        </TabsContent>

        {/* Sources Tab */}
        <TabsContent value="sources" className="space-y-4">
          <Suspense fallback={<PageSkeleton />}>
            <SourceBreakdownChart sources={stats.sources} />
          </Suspense>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-4">
          <Suspense fallback={<PageSkeleton />}>
            <RecentActivityTable events={stats.recentEvents} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
