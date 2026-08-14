import { DashboardChrome } from "@/components/dashboard/DashboardChrome";
import { getSession } from "@/lib/server-auth";
import { resolveLayoutRole } from "@/lib/admin-auth";
import { redirect } from "next/navigation";
import { DragDropProvider } from "@/components/providers/dnd-provider";
import { FloatingAiAssistant } from "@/components/ai/FloatingAiAssistant";
import { isSiteAdmin } from "@/lib/roles";
import { getAllTenants } from "@/lib/db/repositories/tenant-repository";
import { SiteAdminScopeGuard } from "@/components/dashboard/SiteAdminScopeGuard";

/**
 * Dashboard Layout — server chrome (sidebar + header).
 *
 * Auth:
 * - Middleware already requires a session cookie for /dashboard/*
 * - Layout reads cookie for role-aware nav (no Cognito / no DynamoDB on the
 *   happy path — role comes from the cookie written at login).
 *
 * Note: we intentionally do NOT set `export const dynamic = 'force-dynamic'`.
 * Using `cookies()` via getSession() already opts this layout into dynamic
 * rendering when needed, without forcing a full re-render policy that fights
 * soft navigation caching.
 */

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session || typeof session !== "object" || !session.userId) {
    redirect("/login");
  }

  // Cookie role + env allowlists only — no DynamoDB on every menu click
  const role = await resolveLayoutRole(session);
  // Operational picker: real customer orgs only (not the internal platform home)
  const availableTenants = isSiteAdmin(role)
    ? (await getAllTenants({ includePlatform: false }))
        .map((tenant) => ({ id: tenant.id, name: tenant.name }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const tenantInfo = {
    userId: session.userId || "",
    email: session.email || "",
    fullName: "User",
    // Site admins: home is platform; scope defaults to all
    tenantId: session.tenantId || "",
    tenantScope: isSiteAdmin(role)
      ? session.tenantScope || "all"
      : session.tenantId || "",
    availableTenants,
    role,
  };

  return (
    <DragDropProvider>
      {/* Use semantic bg-background only — dual bg-gray-50 + dark:bg-* leaves
          bg-gray-50 in the class list, which global dark-ink rules treated as a
          light panel and forced black text on the whole canvas. */}
      <div className="min-h-screen bg-background text-foreground">
        <DashboardChrome
          role={role}
          tenantScope={tenantInfo.tenantScope}
          user={tenantInfo}
        >
          <SiteAdminScopeGuard
            allTenantsSelected={
              isSiteAdmin(role) && tenantInfo.tenantScope === "all"
            }
          >
            {children}
          </SiteAdminScopeGuard>
        </DashboardChrome>
        {/* Global fab + slide-over — same tools as AI Assistant page */}
        <FloatingAiAssistant />
      </div>
    </DragDropProvider>
  );
}
