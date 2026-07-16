"use client";

import { Bell, Search, User } from "lucide-react";
import { roleLabel } from "@/lib/roles";

interface DashboardHeaderProps {
  user?: {
    full_name?: string;
    fullName?: string;
    email?: string;
    role?: string;
    tenants?: { name?: string };
  };
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
  const displayName = user?.full_name || user?.fullName || user?.email || "User";
  const subtitle = user?.role
    ? roleLabel(user.role)
    : user?.tenants?.name || "";

  return (
    <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-background">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search candidates, companies, jobs..."
            className="w-full h-10 pl-10 pr-4 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button className="relative p-2 rounded-md hover:bg-accent">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 h-2 w-2 bg-destructive rounded-full" />
        </button>

        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
            <User className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="text-sm">
            <p className="font-medium">{displayName}</p>
            {subtitle ? (
              <p className="text-muted-foreground text-xs">{subtitle}</p>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
