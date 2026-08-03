import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/server-auth";
import { resolveLayoutRole } from "@/lib/admin-auth";
import { redirect } from "next/navigation";

/**
 * Legacy /candidates/* routes share the same chrome as /dashboard/*.
 * Sidebar is position:fixed (w-72) — content MUST use ml-72 or it sits under the nav.
 *
 * Same fast-path as dashboard layout: cookie role only (no force-dynamic /
 * no DynamoDB on the happy path). Middleware already gates the route.
 */

export default async function CandidatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session?.userId) {
    redirect("/login");
  }

  const role = await resolveLayoutRole(session);

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar role={role} />
      <div className="ml-72">
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
