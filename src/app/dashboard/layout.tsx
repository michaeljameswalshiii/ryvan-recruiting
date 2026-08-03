import Sidebar from "@/components/Sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { getSession } from "@/lib/server-auth";
import { resolveLayoutRole } from "@/lib/admin-auth";
import { redirect } from "next/navigation";
import { DragDropProvider } from "@/components/providers/dnd-provider";
import { FloatingAiAssistant } from "@/components/ai/FloatingAiAssistant";

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

  const tenantInfo = {
    userId: session.userId || "",
    email: session.email || "",
    fullName: "User",
    tenantId: session.tenantId || "",
    role,
  };

  return (
    <DragDropProvider>
      {/* Use semantic bg-background only — dual bg-gray-50 + dark:bg-* leaves
          bg-gray-50 in the class list, which global dark-ink rules treated as a
          light panel and forced black text on the whole canvas. */}
      <div className="min-h-screen bg-background text-foreground">
        <Sidebar role={role} />
        {/* min-w-0 prevents wide tables from expanding past the viewport (right-edge clip) */}
        <div className="ml-72 min-w-0 max-w-full bg-background">
          <DashboardHeader user={tenantInfo} />
          <main className="min-w-0 max-w-full overflow-x-hidden p-6 bg-background">
            {children}
          </main>
        </div>
        {/* Global fab + slide-over — same tools as AI Assistant page */}
        <FloatingAiAssistant />
      </div>
    </DragDropProvider>
  );
}
