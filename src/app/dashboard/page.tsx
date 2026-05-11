/**
 * Main Dashboard Page
 * Shows overview stats and recent activity using TanStack Query for data fetching
 */

'use client';

import { Users, Building2, Briefcase, TrendingUp } from "lucide-react";
import { useDashboardStats, useRecentActivity } from "@/lib/hooks/query-dashboard";
import { StatsCardSkeleton, DataTableSkeleton } from "@/components/ui/skeleton";

interface StatCard {
  label: string;
  key: "contacts" | "companies" | "openJobs" | "placements";
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const statCards: StatCard[] = [
  {
    label: "Candidates",
    key: "contacts",
    icon: Users,
    color: "text-blue-500",
  },
  {
    label: "Companies",
    key: "companies",
    icon: Building2,
    color: "text-green-500",
  },
  {
    label: "Open Jobs",
    key: "openJobs",
    icon: Briefcase,
    color: "text-orange-500",
  },
  {
    label: "Placements",
    key: "placements",
    icon: TrendingUp,
    color: "text-purple-500",
  },
];

export default function DashboardPage() {
  const { stats, isLoading: statsLoading } = useDashboardStats();
  const { activity, isLoading: activityLoading } = useRecentActivity();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back! Here&apos;s what&apos;s happening.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          // Show skeleton loading states
          Array.from({ length: 4 }).map((_, i) => (
            <StatsCardSkeleton key={i} />
          ))
        ) : (
          statCards.map((stat) => {
            const Icon = stat.icon;
            const value = stats[stat.key] || 0;
            return (
              <div
                key={stat.label}
                className="p-6 rounded-lg border border-border bg-card"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {stat.label}
                    </p>
                    <p className="text-2xl font-bold">{value}</p>
                  </div>
                  <Icon className={`h-8 w-8 ${stat.color}`} />
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent Activity */}
        <div className="p-6 rounded-lg border border-border bg-card">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          {activityLoading ? (
            <DataTableSkeleton rows={3} />
          ) : activity.length > 0 ? (
            <div className="space-y-3">
              {activity.slice(0, 5).map((item: any) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.company} • {item.action}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {item.date ? new Date(item.date).toLocaleDateString() : ''}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No recent activity. Start adding candidates to see activity here.
            </p>
          )}
        </div>

        {/* Quick Actions */}
        <div className="p-6 rounded-lg border border-border bg-card">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <a
              href="/dashboard/leads"
              className="block p-3 rounded-md bg-accent hover:bg-accent/80 text-sm"
            >
              + Add New Candidate
            </a>
            <a
              href="/dashboard/companies"
              className="block p-3 rounded-md bg-accent hover:bg-accent/80 text-sm"
            >
              + Add New Company
            </a>
            <a
              href="/dashboard/pipeline"
              className="block p-3 rounded-md bg-accent hover:bg-accent/80 text-sm"
            >
              + Add to Pipeline
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
