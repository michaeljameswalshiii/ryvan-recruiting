/**
 * GET /api/site-admin/tenants/[id]
 * PATCH — plan, seats, status, branding
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireSiteAdminSession,
  isAdminAuthError,
} from "@/lib/admin-auth";
import {
  getTenantById,
  updateTenant,
  withPlanDefaults,
} from "@/lib/db/repositories/tenant-repository";
import {
  getProfilesByTenant,
  toPublicMember,
  countBillableSeats,
} from "@/lib/db/repositories/profile-repository";
import { siteAdminUpdateTenantSchema } from "@/lib/schemas/tenant";
import { planLabel } from "@/lib/plans";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Ctx) {
  try {
    const auth = await requireSiteAdminSession();
    if (isAdminAuthError(auth)) return auth;

    const { id } = await context.params;
    const tenant = await getTenantById(id);
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const enriched = withPlanDefaults(tenant);
    const members = await getProfilesByTenant(id);

    return NextResponse.json({
      tenant: {
        ...enriched,
        plan_label: planLabel(enriched.plan),
        seats_used: countBillableSeats(members),
      },
      members: members.map(toPublicMember),
    });
  } catch (error) {
    console.error("[GET /api/site-admin/tenants/id]", error);
    return NextResponse.json({ error: "Failed to load tenant" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const auth = await requireSiteAdminSession();
    if (isAdminAuthError(auth)) return auth;

    const { id } = await context.params;
    const existing = await getTenantById(id);
    if (!existing) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = siteAdminUpdateTenantSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await updateTenant(id, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    const enriched = withPlanDefaults(updated);
    return NextResponse.json({
      tenant: {
        ...enriched,
        plan_label: planLabel(enriched.plan),
      },
    });
  } catch (error) {
    console.error("[PATCH /api/site-admin/tenants/id]", error);
    return NextResponse.json({ error: "Failed to update tenant" }, { status: 500 });
  }
}
