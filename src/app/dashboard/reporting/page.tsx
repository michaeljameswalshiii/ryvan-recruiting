/**
 * Reporting Dashboard
 * 
 * QuickSight embedded dashboards with fallback charts.
 * Tabs: Overview | Pipeline Analytics | AI Usage | Custom Reports
 * 
 * @serverOnly - Data fetched server-side
 */

import { Suspense } from 'react';
import { getReportingData, isQuickSightConfigured } from '@/lib/aws/reporting';
import { 
  BarChart3, 
  PieChart, 
  TrendingUp, 
  FileText,
  Loader2 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Format number with K/M suffix
 */
function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

/**
 * Format currency
 */
function formatCurrency(num: number): string {
  if (num < 0.01) return '<$0.01';
  return `$${num.toFixed(2)}`;
}

/**
 * Loading skeleton for charts
 */
function ChartSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

/**
 * Fallback Overview Chart
 */
function OverviewChart({ data }: { data: any }) {
  const { pipeline, candidates } = data;
  
  // Calculate conversion rates
  const contacted = candidates.byStatus.find((s: any) => s.status === 'contacted')?.count || 0;
  const qualified = candidates.byStatus.find((s: any) => s.status === 'qualified')?.count || 0;
  const submitted = pipeline.byStage.find((s: any) => s.stage === 'submitted')?.count || 0;
  const offer = pipeline.byStage.find((s: any) => s.stage === 'offer')?.count || 0;
  
  const outreachRate = candidates.total > 0 ? ((contacted / candidates.total) * 100).toFixed(1) : '0';
  const pipelineConversion = pipeline.total > 0 ? ((submitted / pipeline.total) * 100).toFixed(1) : '0';
  const offerRate = pipeline.total > 0 ? ((offer / pipeline.total) * 100).toFixed(1) : '0';

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Candidates</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{candidates.total}</div>
          <p className="text-xs text-muted-foreground">
            In database
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pipeline</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{pipeline.total}</div>
          <p className="text-xs text-muted-foreground">
            Active opportunities
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Outreach Rate</CardTitle>
          <PieChart className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{outreachRate}%</div>
          <p className="text-xs text-muted-foreground">
            Contacted
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Offer Rate</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{offerRate}%</div>
          <p className="text-xs text-muted-foreground">
            Of pipeline
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Fallback Pipeline Analytics Chart
 */
function PipelineChart({ data }: { data: any }) {
  const { pipeline } = data;
  const total = pipeline.total || 1;
  
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Pipeline by Stage</CardTitle>
          <CardDescription>Distribution of opportunities</CardDescription>
        </CardHeader>
        <CardContent>
          {pipeline.byStage.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pipeline data</p>
          ) : (
            <div className="space-y-4">
              {pipeline.byStage.map((stage: any) => {
                const percentage = ((stage.count / total) * 100).toFixed(1);
                return (
                  <div key={stage.stage} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium capitalize">{stage.stage}</span>
                      <span className="text-muted-foreground">
                        {stage.count} ({percentage}%)
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline Summary</CardTitle>
          <CardDescription>Key metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Opportunities</span>
              <span className="font-medium">{pipeline.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Stages</span>
              <span className="font-medium">{pipeline.byStage.length}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Fallback AI Usage Chart
 */
function UsageChart({ data }: { data: any }) {
  const { aiUsage } = data;
  
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Today</CardTitle>
          <Loader2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatNumber(aiUsage.day.totalTokens)}
          </div>
          <p className="text-xs text-muted-foreground">
            {aiUsage.day.totalInvocations} calls • {formatCurrency(aiUsage.day.estimatedCost)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">This Week</CardTitle>
          <Loader2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatNumber(aiUsage.week.totalTokens)}
          </div>
          <p className="text-xs text-muted-foreground">
            {aiUsage.week.totalInvocations} calls • {formatCurrency(aiUsage.week.estimatedCost)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">This Month</CardTitle>
          <Loader2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatNumber(aiUsage.month.totalTokens)}
          </div>
          <p className="text-xs text-muted-foreground">
            {aiUsage.month.totalInvocations} calls • {formatCurrency(aiUsage.month.estimatedCost)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Fallback Custom Report Placeholder
 */
function CustomReportPlaceholder() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom Reports</CardTitle>
        <CardDescription>Create and save custom report views</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground mb-4">
            Custom reports require QuickSight configuration
          </p>
          <a 
            href="/dashboard/usage"
            className="text-sm text-primary hover:underline"
          >
            View AI Usage Dashboard →
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * QuickSight Embed Component
 */
async function QuickSightEmbed() {
  const isConfigured = isQuickSightConfigured();
  
  if (!isConfigured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>QuickSight Not Configured</CardTitle>
          <CardDescription>Set up QuickSight to enable embedded dashboards</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-4">
              Configure AWS QuickSight to enable embedded dashboards
            </p>
            <a 
              href="/AWS_QUICKSIGHT_REPORTING_SETUP.md"
              className="text-sm text-primary hover:underline"
            >
              View Setup Guide →
            </a>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Try to get embed URL
  const { generateDashboardEmbedUrl } = await import('@/lib/aws/reporting');
  
  const embedResult = await generateDashboardEmbedUrl({
    dashboardId: 'primary-dashboard', // Default dashboard ID - should come from config
  });

  if (!embedResult) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dashboard Unavailable</CardTitle>
          <CardDescription>Unable to load QuickSight dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Please check your QuickSight configuration and dashboard ID.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-[600px] w-full border rounded-lg overflow-hidden">
      <iframe
        src={embedResult.embedUrl}
        className="w-full h-full"
        allowFullScreen
      />
    </div>
  );
}

/**
 * Main Reporting Page
 */
export default async function ReportingDashboardPage() {
  // Fetch all reporting data server-side for fallback charts
  const reportingData = await getReportingData();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reporting</h1>
          <p className="text-muted-foreground">
            Unified analytics and reporting
          </p>
        </div>
      </div>

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
          <TabsTrigger value="usage">
            <Loader2 className="h-4 w-4 mr-2" />
            AI Usage
          </TabsTrigger>
          <TabsTrigger value="custom">
            <FileText className="h-4 w-4 mr-2" />
            Custom
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Suspense fallback={<ChartSkeleton />}>
            <OverviewChart data={reportingData} />
          </Suspense>
        </TabsContent>

        <TabsContent value="pipeline" className="space-y-4">
          <Suspense fallback={<ChartSkeleton />}>
            <PipelineChart data={reportingData} />
          </Suspense>
        </TabsContent>

        <TabsContent value="usage" className="space-y-4">
          <Suspense fallback={<ChartSkeleton />}>
            <UsageChart data={reportingData} />
          </Suspense>
        </TabsContent>

        <TabsContent value="custom" className="space-y-4">
          <Suspense fallback={<ChartSkeleton />}>
            <CustomReportPlaceholder />
          </Suspense>
        </TabsContent>
      </Tabs>

      {/* QuickSight Embed Section */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">QuickSight Dashboards</h2>
        <Suspense fallback={<ChartSkeleton />}>
          <QuickSightEmbed />
        </Suspense>
      </div>
    </div>
  );
}
