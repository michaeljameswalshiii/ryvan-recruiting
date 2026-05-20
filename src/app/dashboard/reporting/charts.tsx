/**
 * Reporting Dashboard Charts
 * 
 * 7 Recharts components for the reporting dashboard:
 * - KPICards: 4 KPI metric cards
 * - PipelineOverviewTab: Overview with mini charts
 * - PipelineFunnelChart: Funnel visualization
 * - CandidatesOverTimeChart: Line/bar chart over time
 * - StageDistributionChart: Pie/donut chart
 * - SourceBreakdownChart: Bar chart by source
 * - RecentActivityTable: Table of recent events
 * 
 * @serverOnly - Uses server-side data types
 */

'use client';

import {
  ReportingStats,
  PipelineStats,
  CandidatesOverTimeData,
  SourceStats,
  EventStats,
} from '@/lib/aws/reporting';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from 'recharts';

import {
  Users,
  Briefcase,
  TrendingUp,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Calendar,
  Activity,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// ============================================================================
// Chart Colors
// ============================================================================

const COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
];

// ============================================================================
// KPICards Component
// ============================================================================

interface KPICardsProps {
  stats: ReportingStats;
}

/**
 * KPICards - Displays 4 key metrics
 */
export function KPICards({ stats }: KPICardsProps) {
  const kpis = [
    {
      title: 'Total Candidates',
      value: stats.totalCandidates,
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-950',
    },
    {
      title: 'In Pipeline',
      value: stats.inPipeline,
      icon: Briefcase,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950',
    },
    {
      title: 'Hired This Month',
      value: stats.hiredThisMonth,
      icon: TrendingUp,
      color: 'text-amber-500',
      bgColor: 'bg-amber-50 dark:bg-amber-950',
    },
    {
      title: 'Avg. Time to Hire',
      value: `${stats.avgTimeToHire} days`,
      icon: Clock,
      color: 'text-violet-500',
      bgColor: 'bg-violet-50 dark:bg-violet-950',
      isString: true,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {kpis.map((kpi, index) => (
        <Card key={index}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-x-4">
              <div className={`p-2 rounded-lg ${kpi.bgColor}`}>
                <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">{kpi.title}</p>
                <p className="text-2xl font-bold">
                  {kpi.isString ? kpi.value : kpi.value.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// PipelineOverviewTab Component
// ============================================================================

interface PipelineOverviewTabProps {
  stats: ReportingStats;
}

/**
 * PipelineOverviewTab - Overview with mini charts
 */
export function PipelineOverviewTab({ stats }: PipelineOverviewTabProps) {
  // Mini chart data - top 5 stages
  const topStages = stats.pipeline.byStage.slice(0, 5);
  
  // Calculate percentages
  const total = stats.pipeline.total || 1;
  const stageData = topStages.map((stage) => ({
    name: stage.label,
    value: stage.count,
    percentage: Math.round((stage.count / total) * 100),
  }));

  // Candidates over time - last 7 days
  const last7Days = stats.candidatesOverTime.period.slice(-7);
  const trendData = last7Days.map((day) => ({
    date: new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }),
    count: day.count,
  }));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Stage Distribution Mini */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Stage Distribution</CardTitle>
          <CardDescription>Top pipeline stages</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stageData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis 
                dataKey="name" 
                type="category" 
                width={100}
                tick={{ fontSize: 12 }}
              />
<Tooltip 
                formatter={(value) => [`${value} candidates`, 'Count']}
              />
              <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Activity Trend Mini */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Recent Activity</CardTitle>
          <CardDescription>Last 7 days trend</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 11 }}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// PipelineFunnelChart Component
// ============================================================================

interface PipelineFunnelChartProps {
  pipeline: PipelineStats;
}

/**
 * PipelineFunnelChart - Funnel visualization of pipeline stages
 */
export function PipelineFunnelChart({ pipeline }: PipelineFunnelChartProps) {
  const total = pipeline.total || 1;
  
  const funnelData = pipeline.byStage.map((stage) => ({
    name: stage.label,
    value: stage.count,
    percentage: Math.round((stage.count / total) * 100),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline Funnel</CardTitle>
        <CardDescription>Candidates by pipeline stage</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {funnelData.map((stage, index) => {
            const width = Math.max(20, stage.percentage);
            return (
              <div key={index} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{stage.name}</span>
                  <span className="text-muted-foreground">
                    {stage.value.toLocaleString()} ({stage.percentage}%)
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${width}%`,
                      backgroundColor: COLORS[index % COLORS.length],
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// CandidatesOverTimeChart Component
// ============================================================================

interface CandidatesOverTimeChartProps {
  candidates: CandidatesOverTimeData;
}

/**
 * CandidatesOverTimeChart - Line/bar chart showing candidates over time
 */
export function CandidatesOverTimeChart({ candidates }: CandidatesOverTimeChartProps) {
  // Aggregate by week for better visualization
  const data = candidates.period.map((day) => ({
    date: new Date(day.date).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    }),
    count: day.count,
  }));

  // Group by week if too many data points
  const displayData = data.length > 14
    ? data.filter((_, i) => i % 7 === 0).map((d, i, arr) => {
        if (i < arr.length - 1) {
          const startIdx = i * 7;
          const endIdx = Math.min(startIdx + 7, data.length);
          const sum = data.slice(startIdx, endIdx).reduce((s, item) => s + item.count, 0);
          return { date: d.date, count: sum };
        }
        return d;
      })
    : data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Candidates Over Time</CardTitle>
        <CardDescription>New candidates added over the period</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={displayData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
<Tooltip
              formatter={(value) => [`${value} candidates`, 'Count']}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.2}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// StageDistributionChart Component
// ============================================================================

interface StageDistributionChartProps {
  pipeline: PipelineStats;
}

/**
 * StageDistributionChart - Pie/donut chart of stage distribution
 */
export function StageDistributionChart({ pipeline }: StageDistributionChartProps) {
  const pieData = pipeline.byStage.map((stage, index) => ({
    name: stage.label,
    value: stage.count,
    color: COLORS[index % COLORS.length],
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stage Distribution</CardTitle>
        <CardDescription>Percentage breakdown by stage</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
label={({ name, percent }) => 
                `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
              }
              labelLine={false}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
<Tooltip
              formatter={(value) => [`${value} candidates`, 'Count']}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// SourceBreakdownChart Component
// ============================================================================

interface SourceBreakdownChartProps {
  sources: SourceStats;
}

/**
 * SourceBreakdownChart - Bar chart of candidates by source
 */
export function SourceBreakdownChart({ sources }: SourceBreakdownChartProps) {
  const barData = sources.bySource.map((source, index) => ({
    name: source.label,
    count: source.count,
    fill: COLORS[index % COLORS.length],
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Source Breakdown</CardTitle>
        <CardDescription>Candidates by recruitment source</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={barData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" hide />
            <YAxis
              dataKey="name"
              type="category"
              width={100}
              tick={{ fontSize: 12 }}
            />
<Tooltip
              formatter={(value) => [`${value} candidates`, 'Count']}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {barData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// RecentActivityTable Component
// ============================================================================

interface RecentActivityTableProps {
  events: EventStats;
}

/**
 * RecentActivityTable - Table of recent candidate events
 */
export function RecentActivityTable({ events }: RecentActivityTableProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getEventBadge = (eventType: string) => {
    const type = eventType.toLowerCase();
    if (type.includes('stage') || type.includes('status')) {
      return <Badge variant="default">Stage Change</Badge>;
    }
    if (type.includes('note') || type.includes('comment')) {
      return <Badge variant="secondary">Note</Badge>;
    }
    if (type.includes('email')) {
      return <Badge variant="outline">Email</Badge>;
    }
    if (type.includes('meeting') || type.includes('interview')) {
      return <Badge className="bg-purple-500">Interview</Badge>;
    }
    return <Badge variant="outline">{eventType}</Badge>;
  };

  if (events.events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest candidate events</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Activity className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p>No recent activity</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Latest candidate events</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b text-left text-sm text-muted-foreground">
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Event</th>
                <th className="pb-2 font-medium">Title</th>
                <th className="pb-2 font-medium">By</th>
              </tr>
            </thead>
            <tbody>
              {events.events.slice(0, 10).map((event, index) => (
                <tr key={event.id || index} className="border-b last:border-0">
                  <td className="py-3 text-sm">{formatDate(event.createdAt)}</td>
                  <td className="py-3">{getEventBadge(event.eventType)}</td>
                  <td className="py-3 text-sm font-medium">{event.title}</td>
                  <td className="py-3 text-sm text-muted-foreground">
                    {event.createdBy}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
