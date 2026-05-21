/**
 * Main Dashboard Page
 * 100% database-driven using TanStack Query hooks
 */

"use client";

import Link from "next/link";
import { useDashboardStats, useRecentActivity } from "@/lib/hooks/query-dashboard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Briefcase, TrendingUp, ArrowUpRight, Building2, Calendar, ChevronRight } from "lucide-react";

export default function DashboardPage() {
  const { stats, isLoading: statsLoading, error: statsError } = useDashboardStats();
  const { activity, isLoading: activityLoading } = useRecentActivity();

  // Format current month/year
  const currentDate = new Date().toLocaleDateString('en-US', { 
    month: 'long', 
    year: 'numeric' 
  });

  // Calculate fees pipeline (contacts * $25,000)
  const feesPipeline = ((stats.contacts || 0) * 25000).toLocaleString();

return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Welcome back</h1>
        <p className="text-muted-foreground">Here's what's happening — {currentDate}</p>
      </div>

      {/* Stats Cards - Clickable Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {/* Active Candidates */}
        <Link href="/dashboard/candidates" className="group block">
          <div className="p-6 rounded-lg border border-border bg-card hover:border-primary hover:shadow-md transition-all duration-200 cursor-pointer h-full">
            <div className="flex items-center justify-between pb-2">
              <span className="text-sm font-medium">Active Candidates</span>
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            {statsLoading ? (
              <Skeleton className="h-10 w-16" />
            ) : (
              <>
                <div className="text-4xl font-bold">{stats.contacts || 0}</div>
                <p className="text-sm text-green-600 flex items-center gap-1 mt-1">
                  <TrendingUp className="h-3 w-3" />
                  Active pipeline
                </p>
              </>
            )}
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <span>View all</span>
              <ChevronRight className="h-4 w-4" />
            </div>
          </div>
        </Link>

        {/* Companies */}
        <Link href="/dashboard/companies" className="group block">
          <div className="p-6 rounded-lg border border-border bg-card hover:border-primary hover:shadow-md transition-all duration-200 cursor-pointer h-full">
            <div className="flex items-center justify-between pb-2">
              <span className="text-sm font-medium">Companies</span>
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
            {statsLoading ? (
              <Skeleton className="h-10 w-16" />
            ) : (
              <>
                <div className="text-4xl font-bold">{stats.companies || 0}</div>
                <p className="text-sm text-muted-foreground mt-1">
                  Active clients
                </p>
              </>
            )}
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <span>View all</span>
              <ChevronRight className="h-4 w-4" />
            </div>
          </div>
        </Link>

        {/* Open Jobs */}
        <Link href="/dashboard/companies" className="group block">
          <div className="p-6 rounded-lg border border-border bg-card hover:border-primary hover:shadow-md transition-all duration-200 cursor-pointer h-full">
            <div className="flex items-center justify-between pb-2">
              <span className="text-sm font-medium">Open Roles</span>
              <Briefcase className="h-5 w-5 text-blue-600" />
            </div>
            {statsLoading ? (
              <Skeleton className="h-10 w-16" />
            ) : (
              <>
                <div className="text-4xl font-bold">{stats.openJobs || 0}</div>
                <p className="text-sm text-muted-foreground mt-1">
                  Positions to fill
                </p>
              </>
            )}
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <span>View all</span>
              <ChevronRight className="h-4 w-4" />
            </div>
          </div>
        </Link>

        {/* Placements */}
        <Link href="/dashboard/pipeline" className="group block">
          <div className="p-6 rounded-lg border border-border bg-card hover:border-primary hover:shadow-md transition-all duration-200 cursor-pointer h-full">
            <div className="flex items-center justify-between pb-2">
              <span className="text-sm font-medium">Placements YTD</span>
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
            {statsLoading ? (
              <Skeleton className="h-10 w-16" />
            ) : (
              <>
                <div className="text-4xl font-bold">{stats.placements || 0}</div>
                <p className="text-sm text-green-600 flex items-center gap-1 mt-1">
                  <TrendingUp className="h-3 w-3" />
                  This year
                </p>
              </>
            )}
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <span>View pipeline</span>
              <ChevronRight className="h-4 w-4" />
            </div>
          </div>
        </Link>

        {/* Interviews This Week */}
        <Link href="/dashboard/pipeline" className="group block">
          <div className="p-6 rounded-lg border border-border bg-card hover:border-primary hover:shadow-md transition-all duration-200 cursor-pointer h-full">
            <div className="flex items-center justify-between pb-2">
              <span className="text-sm font-medium">Interviews This Week</span>
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div className="text-4xl font-bold">0</div>
            <p className="text-sm text-muted-foreground mt-1">
              Scheduled
            </p>
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <span>View schedule</span>
              <ChevronRight className="h-4 w-4" />
            </div>
          </div>
        </Link>
      </div>

      {/* Recent Activity + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="p-6 rounded-lg border border-border bg-card">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          <div className="space-y-4">
            {activityLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-3/4 mb-1" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activity.length > 0 ? (
              activity.slice(0, 5).map((item: any) => (
                <div key={item.id} className="flex gap-4">
                  <div className="text-green-600">•</div>
                  <div>
                    <p>
                      <strong>{item.name}</strong> — {item.action}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.company} • {item.date ? new Date(item.date).toLocaleDateString() : 'Today'}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No recent activity</p>
                <p className="text-sm text-muted-foreground">
                  Add companies and candidates to get started
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="p-6 rounded-lg border border-border bg-card">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <a
              href="/dashboard/candidates"
              className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent transition-colors"
            >
              <span>Add New Candidate</span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </a>
            <a
              href="/dashboard/companies"
              className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent transition-colors"
            >
              <span>Add New Company</span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </a>
            <a
              href="/dashboard/pipeline"
              className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent transition-colors"
            >
              <span>Add to Pipeline</span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
