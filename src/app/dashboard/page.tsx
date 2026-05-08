"use client";

import { Users, Building2, Briefcase, TrendingUp } from "lucide-react";

// Mock stats for now - will be replaced with DynamoDB calls
const stats = {
  contacts: 0,
  companies: 0,
  openJobs: 0,
  placements: 0,
};

const statCards = [
  {
    label: "Candidates",
    value: stats.contacts,
    icon: Users,
    color: "text-blue-500",
  },
  {
    label: "Companies",
    value: stats.companies,
    icon: Building2,
    color: "text-green-500",
  },
  {
    label: "Open Jobs",
    value: stats.openJobs,
    icon: Briefcase,
    color: "text-orange-500",
  },
  {
    label: "Placements",
    value: stats.placements,
    icon: TrendingUp,
    color: "text-purple-500",
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back! Here's what's happening.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
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
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
                <Icon className={`h-8 w-8 ${stat.color}`} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="p-6 rounded-lg border border-border bg-card">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          <p className="text-muted-foreground text-sm">
            No recent activity. Start adding candidates to see activity here.
          </p>
        </div>

        <div className="p-6 rounded-lg border border-border bg-card">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <a
              href="/dashboard/contacts/new"
              className="block p-3 rounded-md bg-accent hover:bg-accent/80 text-sm"
            >
              + Add New Candidate
            </a>
            <a
              href="/dashboard/companies/new"
              className="block p-3 rounded-md bg-accent hover:bg-accent/80 text-sm"
            >
              + Add New Company
            </a>
            <a
              href="/dashboard/jobs/new"
              className="block p-3 rounded-md bg-accent hover:bg-accent/80 text-sm"
            >
              + Post New Job
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
