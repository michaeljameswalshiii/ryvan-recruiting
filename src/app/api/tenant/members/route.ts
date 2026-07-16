/**
 * GET /api/tenant/members — list team (team_admin)
 */

import { NextResponse } from "next/server";
import {
  requireAuthSession,
  isAdminAuthError,
} from "@/lib/admin-auth";
import {
  requireTenantId,
  requireTeamAdmin,
  isAuthError,
} from "@/lib/tenant-guard";
import {
  getProfilesByTenant,
  toPublicMember,
  countBillableSeats,
} from "@/lib/db/repositories/profile-repository";
import {
  getTenantById,
  withPlanDefaults,
} from "@/lib/db/repositories/tenant-repository";

export async function GET() {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;

    const teamOk = requireTeamAdmin(auth);
    if (isAuthError(teamOk)) return teamOk;

    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const [profiles, tenant] = await Promise.all([
      getProfilesByTenant(tenantId),
      getTenantById(tenantId),
    ]);

    const enriched = tenant ? withPlanDefaults(tenant) : null;

    return NextResponse.json({
      members: profiles.map(toPublicMember),
      seats_used: countBillableSeats(profiles),
      seat_limit: enriched?.seat_limit ?? 3,
      plan: enriched?.plan ?? "free",
    });
  } catch (error) {
    console.error("[GET /api/tenant/members]", error);
    return NextResponse.json(
      { error: "Failed to list members" },
      { status: 500 }
    );
  }
}
