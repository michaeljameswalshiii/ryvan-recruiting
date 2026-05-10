import { DashboardNav } from "@/components/dashboard/nav";
import { DashboardHeader } from "@/components/dashboard/header";
import { validateSession } from "@/lib/server-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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
  // Validate session server-side
  const session = await validateSession();
  
  if (!session) {
    // Redirect to login if no valid session
    // (middleware should catch this, but defense-in-depth)
    redirect('/login');
  }

  // Get tenant info from session for display
  const tenantInfo = {
    userId: session.userId,
    email: session.email,
    fullName: session.fullName,
    tenantId: session.tenantId,
    role: session.role,
  };

  return (
    <div className="min-h-screen bg-background">
      {/* @ts-expect-error Server Component */}
      <DashboardNav session={tenantInfo} />
      <div className="pl-64">
        <DashboardHeader user={tenantInfo} />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
