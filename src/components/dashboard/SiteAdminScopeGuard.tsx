"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2 } from "lucide-react";

const TENANT_REQUIRED_PREFIXES = [
  "/dashboard/candidates",
  "/dashboard/companies",
  "/dashboard/contact-info",
  "/dashboard/contacts",
  "/dashboard/jobs",
  "/dashboard/talent-graph",
  "/dashboard/sequences",
  "/dashboard/scheduling",
  "/dashboard/general-ai-usage",
  "/dashboard/settings",
];

export function SiteAdminScopeGuard({
  allTenantsSelected,
  children,
}: {
  allTenantsSelected: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const requiresTenant = TENANT_REQUIRED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!allTenantsSelected || !requiresTenant) return children;

  return (
    <div className="mx-auto mt-12 max-w-xl rounded-2xl border border-violet-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-700">
        <Building2 className="h-6 w-6" />
      </div>
      <h1 className="mt-4 text-xl font-semibold text-slate-900">
        Select a tenant to continue
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        All Tenants is an aggregate dashboard view. Choose a specific tenant
        from the top bar before opening or changing operational records.
      </p>
      <Link
        href="/dashboard"
        className="mt-5 inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
      >
        Return to dashboard
      </Link>
    </div>
  );
}
