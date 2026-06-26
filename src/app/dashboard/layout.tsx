import Sidebar from "@/components/Sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { getSession } from "@/lib/server-auth";
import { redirect } from "next/navigation";
import { DragDropProvider } from "@/components/providers/dnd-provider";

/**
 * Dashboard Layout - Server-side auth enforcement
 * 
 * This layout validates the session server-side using httpOnly cookies.
 * Unauthenticated users are redirected to /login by middleware,
 * but we also validate here as defense-in-depth.
 */

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
// Get session from cookie
  const session = await getSession();
  
  if (!session) {
    // Redirect to login if no valid session
    // (middleware should catch this, but defense-in-depth)
    redirect('/login');
  }

  // Defensive: validate session has required fields
  if (!session || typeof session !== 'object') {
    console.error('[DashboardLayout] Invalid session:', session);
    redirect('/login');
  }

// Get tenant info from session for display
  // Note: fullName and role stored in DynamoDB profile, not in cookie
  const tenantInfo = {
    userId: session?.userId || '',
    email: session?.email || '',
    fullName: 'User', // Could fetch from profile if needed
    tenantId: session?.tenantId || '',
    role: 'member', // Could fetch from profile if needed
  };

return (
    <DragDropProvider>
      <div className="min-h-screen bg-gray-50">
        <Sidebar />
        <div className="ml-72">
          <DashboardHeader user={tenantInfo} />
          <main className="p-6">{children}</main>
        </div>
      </div>
    </DragDropProvider>
  );
}
