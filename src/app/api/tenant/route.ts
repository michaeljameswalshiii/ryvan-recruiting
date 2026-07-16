/**
 * GET /api/tenant — current tenant (brand + plan)
 * PATCH /api/tenant — update org branding (team_admin)
 */

import { NextRequest, NextResponse } from "next/server";
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
  getTenantById,
  updateTenant,
  withPlanDefaults,
} from "@/lib/db/repositories/tenant-repository";
import { updateTenantSchema } from "@/lib/schemas/tenant";
import {
  countBillableSeats,
  getProfilesByTenant,
} from "@/lib/db/repositories/profile-repository";
import { planLabel } from "@/lib/plans";

export async function GET() {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;

    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const enriched = withPlanDefaults(tenant);
    const members = await getProfilesByTenant(tenantId);
    const seatsUsed = countBillableSeats(members);

    return NextResponse.json({
      tenant: {
        ...enriched,
        plan_label: planLabel(enriched.plan),
        seats_used: seatsUsed,
      },
    });
  } catch (error) {
    console.error("[GET /api/tenant]", error);
    return NextResponse.json({ error: "Failed to load tenant" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;

    const teamOk = requireTeamAdmin(auth);
    if (isAuthError(teamOk)) return teamOk;

    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const body = await request.json();
    const parsed = updateTenantSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await updateTenant(tenantId, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    return NextResponse.json({ tenant: withPlanDefaults(updated) });
  } catch (error) {
    console.error("[PATCH /api/tenant]", error);
    return NextResponse.json({ error: "Failed to update tenant" }, { status: 500 });
  }
}
