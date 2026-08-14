import { NextResponse } from "next/server";
import { requireAuthSession, isAdminAuthError } from "@/lib/admin-auth";
import { requireTenantId, isAuthError } from "@/lib/tenant-guard";
import {
  getProfilesByTenant,
  toPublicMember,
} from "@/lib/db/repositories/profile-repository";

/** GET /api/object-assignments/members — active teammates for owner pickers. */
export async function GET() {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;
    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const profiles = await getProfilesByTenant(tenantId);
    const members = profiles
      .map(toPublicMember)
      .filter((member) => !member.status || member.status === "active")
      .map((member) => ({
        id: member.id,
        full_name: member.full_name,
        email: member.email,
      }))
      .sort((a, b) =>
        String(a.full_name || a.email).localeCompare(
          String(b.full_name || b.email)
        )
      );

    return NextResponse.json({ members });
  } catch (error) {
    console.error("[GET object-assignment members]", error);
    return NextResponse.json({ members: [] });
  }
}
