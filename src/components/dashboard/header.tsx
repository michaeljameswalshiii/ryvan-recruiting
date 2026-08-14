"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  User,
  Zap,
  Menu,
  ChevronDown,
  UserPlus,
  Building2,
  Contact,
  Briefcase,
  LogOut,
} from "lucide-react";
import { roleLabel } from "@/lib/roles";
import { GlobalSearch } from "@/components/dashboard/GlobalSearch";
import { logout } from "@/lib/api/auth-client";

interface DashboardHeaderProps {
  user?: {
    full_name?: string;
    fullName?: string;
    email?: string;
    role?: string;
    tenantId?: string;
    tenantScope?: string;
    availableTenants?: Array<{ id: string; name: string }>;
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

export function DashboardHeader({
  user,
  onOpenNav,
}: DashboardHeaderProps & { onOpenNav?: () => void }) {
  const router = useRouter();
  const displayName = user?.full_name || user?.fullName || user?.email || "User";
  const subtitle = user?.role
    ? roleLabel(user.role)
    : user?.tenants?.name || "";

  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [scopeBusy, setScopeBusy] = useState(false);
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

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // Still leave the app even if the network call fails
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  const changeTenantScope = async (tenantScope: string) => {
    if (scopeBusy || tenantScope === user?.tenantScope) return;
    setScopeBusy(true);
    try {
      const response = await fetch("/api/site-admin/tenant-scope", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantScope }),
      });
      if (!response.ok) throw new Error("Unable to change tenant scope");
      router.push("/dashboard");
      router.refresh();
    } finally {
      setScopeBusy(false);
    }
  };

  const isAllTenants = user?.role === "site_admin" && user?.tenantScope === "all";

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center justify-between gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:h-16 sm:gap-4 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
        {onOpenNav ? (
          <button
            type="button"
            onClick={onOpenNav}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground xl:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        ) : null}
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {user?.role === "site_admin" && (
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span className="hidden xl:inline">Tenant</span>
            <select
              value={user.tenantScope || "all"}
              disabled={scopeBusy}
              onChange={(event) => void changeTenantScope(event.target.value)}
              className="h-9 max-w-52 rounded-lg border border-border bg-background px-2 text-sm font-semibold text-foreground shadow-sm disabled:opacity-60"
              aria-label="Active tenant"
            >
              <option value="all">All Tenants</option>
              {(user.availableTenants || []).map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {/* Always-available create shortcuts */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => {
              if (!isAllTenants) setMenuOpen((o) => !o);
            }}
            disabled={isAllTenants}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={isAllTenants ? "Select a tenant to create records" : undefined}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-blue-600 text-white text-sm font-medium shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
              data-ink-on-light
              data-popover-surface
              className="surface-light absolute right-0 z-50 mt-2 w-64 rounded-xl border border-gray-200 bg-white py-1.5 shadow-lg"
            >
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-start gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-blue-50"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-900">
                        {action.label}
                      </span>
                      <span className="block text-xs font-medium text-slate-600">
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

        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          aria-label="Log out"
          title="Log out"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-background text-sm font-medium text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden />
          <span className="hidden sm:inline">
            {loggingOut ? "Logging out…" : "Log out"}
          </span>
        </button>
      </div>
    </header>
  );
}
