import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/server-auth";
import { resolveUserRole } from "@/lib/admin-auth";
import { normalizeRole } from "@/lib/roles";
import { redirect } from "next/navigation";

// Force dynamic rendering (session + role for nav)
export const dynamic = "force-dynamic";

/**
 * Legacy /candidates/* routes share the same chrome as /dashboard/*.
 * Sidebar is position:fixed (w-72) — content MUST use ml-72 or it sits under the nav.
 */
export default async function CandidatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const role =
    (await resolveUserRole(session.userId, session.email)) ||
    normalizeRole(session.role);

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar role={role} />
      <div className="ml-72">
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
