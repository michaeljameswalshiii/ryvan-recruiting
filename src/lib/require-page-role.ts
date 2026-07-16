/**
 * Server-side page gate: redirect if the user lacks a permission.
 * @serverOnly
 */

import { redirect } from "next/navigation";
import { getSession } from "@/lib/server-auth";
import { resolveUserRole } from "@/lib/admin-auth";
import {
  hasPermission,
  normalizeRole,
  type Permission,
  type AppRole,
} from "@/lib/roles";

export async function requirePagePermission(
  permission: Permission,
  fallback = "/dashboard"
): Promise<{ role: AppRole; userId: string; tenantId: string; email: string }> {
  const session = await getSession();
  if (!session?.userId) {
    redirect("/login");
  }

  const role =
    (await resolveUserRole(session.userId, session.email)) ||
    normalizeRole(session.role);

  if (!hasPermission(role, permission)) {
    redirect(fallback);
  }

  return {
    role,
    userId: session.userId,
    tenantId: session.tenantId || "",
    email: session.email || "",
  };
}
