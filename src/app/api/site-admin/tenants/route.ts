/**
 * GET /api/site-admin/tenants — list all tenants (Site Admin)
 */

import { NextResponse } from "next/server";
import {
  requireSiteAdminSession,
  isAdminAuthError,
} from "@/lib/admin-auth";
import {
  getAllTenants,
  withPlanDefaults,
} from "@/lib/db/repositories/tenant-repository";
import {
  countBillableSeats,
  getProfilesByTenant,
} from "@/lib/db/repositories/profile-repository";
import { planLabel } from "@/lib/plans";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET() {
  try {
    const auth = await requireSiteAdminSession();
    if (isAdminAuthError(auth)) return auth;

    const rl = checkRateLimit(`site-admin-tenants:${auth.userId}`);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Rate limited" }, { status: 429 });
    }

    // Include platform tenant so site admins can see their home org + sysadmins on it
    const tenants = await getAllTenants({ includePlatform: true });
    const { PLATFORM_TENANT_ID } = await import("@/lib/platform-tenant");
    const rows = await Promise.all(
      tenants.map(async (t) => {
        const enriched = withPlanDefaults(t);
        const members = await getProfilesByTenant(t.id);
        const isPlatform = t.id === PLATFORM_TENANT_ID;
        return {
          id: enriched.id,
          name: enriched.name,
          subdomain: enriched.subdomain,
          plan: enriched.plan,
          plan_label: planLabel(enriched.plan),
          status: enriched.status,
          seat_limit: enriched.seat_limit,
          seats_used: countBillableSeats(members),
          member_count: members.length,
          created_at: enriched.created_at,
          logo_url: enriched.logo_url || null,
          is_platform: isPlatform,
        };
      })
    );

    rows.sort((a, b) =>
      (b.created_at || "").localeCompare(a.created_at || "")
    );

    return NextResponse.json({ tenants: rows });
  } catch (error) {
    console.error("[GET /api/site-admin/tenants]", error);
    return NextResponse.json({ error: "Failed to list tenants" }, { status: 500 });
  }
}
