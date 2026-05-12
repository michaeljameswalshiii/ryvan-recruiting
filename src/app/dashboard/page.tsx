/**
 * Main Dashboard Page
 * Modern Recruiting CRM Style Dashboard with Blue Accents
 */

"use client";

import { useDashboardStats, useRecentActivity } from "@/lib/hooks/query-dashboard";
import { Button } from "@/components/ui/button";
import { Users, Briefcase, TrendingUp, ArrowUpRight, Building2, Calendar } from "lucide-react";

// Seed test data for demo
const handleSeedTestData = async () => {
  try {
    const response = await fetch('/api/seed-test-data', { method: 'POST' });
    const data = await response.json();
    if (data.success) {
      alert(`Test data seeded: ${data.companies} companies, ${data.leads} leads`);
      window.location.reload();
    } else {
      alert('Failed to seed: ' + data.error);
    }
  } catch (err) {
    console.error('Seed error:', err);
    alert('Failed to seed test data');
  }
};

export default function DashboardPage() {
  const { stats, isLoading: statsLoading } = useDashboardStats();
  const { activity, isLoading: activityLoading } = useRecentActivity();

  // Format current month/year
  const currentDate = new Date().toLocaleDateString('en-US', { 
    month: 'long', 
    year: 'numeric' 
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Welcome back</h1>
          <p className="text-muted-foreground">Here's what's happening — {currentDate}</p>
        </div>
        
        <div className="text-right">
          <div className="text-4xl font-semibold text-green-600">
            ${((stats.contacts || 0) * 25000).toLocaleString()}
          </div>
          <p className="text-sm text-muted-foreground">fees pipeline</p>
        </div>
      </div>

{/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {/* Active Candidates */}
        <div className="p-6 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between pb-2">
            <span className="text-sm font-medium">Active Candidates</span>
            <Users className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-4xl font-bold">{stats.contacts || 0}</div>
          <p className="text-sm text-green-600 flex items-center gap-1 mt-1">
            <TrendingUp className="h-3 w-3" />
            Active pipeline
          </p>
        </div>

        {/* Companies */}
        <div className="p-6 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between pb-2">
            <span className="text-sm font-medium">Companies</span>
            <Building2 className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-4xl font-bold">{stats.companies || 0}</div>
          <p className="text-sm text-muted-foreground mt-1">
            Active clients
          </p>
        </div>

        {/* Open Jobs */}
        <div className="p-6 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between pb-2">
            <span className="text-sm font-medium">Open Roles</span>
            <Briefcase className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-4xl font-bold">{stats.openJobs || 0}</div>
          <p className="text-sm text-muted-foreground mt-1">
            Positions to fill
          </p>
        </div>

        {/* Placements */}
        <div className="p-6 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between pb-2">
            <span className="text-sm font-medium">Placements YTD</span>
            <TrendingUp className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-4xl font-bold">{stats.placements || 0}</div>
          <p className="text-sm text-green-600 flex items-center gap-1 mt-1">
            <TrendingUp className="h-3 w-3" />
            This year
          </p>
        </div>

        {/* Interviews This Week */}
        <div className="p-6 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between pb-2">
            <span className="text-sm font-medium">Interviews This Week</span>
            <Calendar className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-4xl font-bold">9</div>
          <p className="text-sm text-green-600 flex items-center gap-1 mt-1">
            <TrendingUp className="h-3 w-3" />
            Scheduled
          </p>
        </div>
      </div>

      {/* Recent Activity + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="p-6 rounded-lg border border-border bg-card">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          <div className="space-y-4">
            {activityLoading ? (
              <p className="text-muted-foreground">Loading...</p>
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
                <Button variant="outline" size="sm" onClick={handleSeedTestData}>
                  Seed Test Data
                </Button>
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
            <a
              href="/dashboard/sourcing"
              className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent transition-colors"
            >
              <span>Source Companies</span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </a>
            <Button 
              variant="outline" 
              onClick={() => window.location.reload()}
              className="w-full justify-between"
            >
              <span>Refresh Dashboard</span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
