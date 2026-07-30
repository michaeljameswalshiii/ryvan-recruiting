import Sidebar from "@/components/Sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { getSession } from "@/lib/server-auth";
import { resolveUserRole } from "@/lib/admin-auth";
import { normalizeRole } from "@/lib/roles";
import { redirect } from "next/navigation";
import { DragDropProvider } from "@/components/providers/dnd-provider";
import { FloatingAiAssistant } from "@/components/ai/FloatingAiAssistant";

// Force dynamic rendering - this layout uses cookies via getSession()
export const dynamic = 'force-dynamic';

/**
 * Dashboard Layout - Server-side auth + role-aware nav
 */

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  
  if (!session) {
    redirect('/login');
  }

  if (!session || typeof session !== 'object') {
    console.error('[DashboardLayout] Invalid session:', session);
    redirect('/login');
  }

  const role =
    (await resolveUserRole(session.userId, session.email)) ||
    normalizeRole(session.role);

  const tenantInfo = {
    userId: session?.userId || '',
    email: session?.email || '',
    fullName: 'User',
    tenantId: session?.tenantId || '',
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
