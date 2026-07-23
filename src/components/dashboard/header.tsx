"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Search,
  User,
  Zap,
  ChevronDown,
  UserPlus,
  Building2,
  Contact,
  Briefcase,
} from "lucide-react";
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
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search candidates, companies, jobs..."
            className="w-full h-10 pl-10 pr-4 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
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
              className="absolute right-0 mt-2 w-64 rounded-xl border border-gray-200 bg-white py-1.5 shadow-lg z-50"
            >
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-start gap-3 px-3 py-2.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block font-medium text-blue-700">
                        {action.label}
                      </span>
                      <span className="block text-xs text-gray-500 font-normal">
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
          className="relative p-2 rounded-md hover:bg-accent"
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
