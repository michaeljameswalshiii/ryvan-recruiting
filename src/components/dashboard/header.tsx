"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  User,
  Zap,
  ChevronDown,
  UserPlus,
  Building2,
  Contact,
  Briefcase,
} from "lucide-react";
import { roleLabel } from "@/lib/roles";
import { GlobalSearch } from "@/components/dashboard/GlobalSearch";

interface DashboardHeaderProps {
  user?: {
    full_name?: string;
    fullName?: string;
    email?: string;
    role?: string;
    tenants?: { name?: string };
  };
}

const QUICK_ACTIONS = [
  {
    href: "/dashboard/candidates/new",
    label: "Add Candidate",
    description: "Create a new pipeline candidate",
    icon: UserPlus,
  },
  {
    href: "/dashboard/companies/new",
    label: "Add Client",
    description: "Add a company / client",
    icon: Building2,
  },
  {
    href: "/dashboard/contacts/new",
    label: "Add Contact",
    description: "Company contact for Contacts",
    icon: Contact,
  },
  {
    href: "/dashboard/jobs/new",
    label: "Add Job",
    description: "Post a new job requisition",
    icon: Briefcase,
  },
] as const;

export function DashboardHeader({ user }: DashboardHeaderProps) {
  const displayName = user?.full_name || user?.fullName || user?.email || "User";
  const subtitle = user?.role
    ? roleLabel(user.role)
    : user?.tenants?.name || "";

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-border flex items-center justify-between gap-4 px-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Always-available create shortcuts */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-blue-600 text-white text-sm font-medium shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">Quick Action</span>
            <ChevronDown
              className={`h-4 w-4 opacity-90 transition-transform ${
                menuOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-64 rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card py-1.5 shadow-lg z-50 text-foreground"
            >
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-start gap-3 px-3 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-white/10 transition-colors"
                  >
                    <Icon className="h-4 w-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-300" />
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-900 dark:text-slate-50">
                        {action.label}
                      </span>
                      <span className="block text-xs text-slate-600 dark:text-slate-300 font-normal">
                        {action.description}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          className="relative p-2 rounded-md hover:bg-accent text-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 h-2 w-2 bg-destructive rounded-full" />
        </button>

        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
            <User className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="text-sm hidden md:block">
            <p className="font-medium text-foreground">{displayName}</p>
            {subtitle ? (
              <p className="text-muted-foreground text-xs">{subtitle}</p>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
