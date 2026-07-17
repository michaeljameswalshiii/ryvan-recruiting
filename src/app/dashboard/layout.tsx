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
      <div className="min-h-screen bg-gray-50">
        <Sidebar role={role} />
        <div className="ml-72">
          <DashboardHeader user={tenantInfo} />
          <main className="p-6">{children}</main>
        </div>
        {/* Global fab + slide-over — same tools as AI Assistant page */}
        <FloatingAiAssistant />
      </div>
    </DragDropProvider>
  );
}
