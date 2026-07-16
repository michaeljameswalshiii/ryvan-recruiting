/**
 * GET /api/tenant/billing — plan packaging (read-only)
 */

import { NextResponse } from "next/server";
import {
  requireAuthSession,
  isAdminAuthError,
} from "@/lib/admin-auth";
import { requireTenantId, isAuthError } from "@/lib/tenant-guard";
import {
  getTenantById,
  withPlanDefaults,
} from "@/lib/db/repositories/tenant-repository";
import {
  countBillableSeats,
  getProfilesByTenant,
} from "@/lib/db/repositories/profile-repository";
import { PLANS, planLabel } from "@/lib/plans";

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
    const def = PLANS[enriched.plan];

    return NextResponse.json({
      plan: enriched.plan,
      plan_label: planLabel(enriched.plan),
      description: def.description,
      status: enriched.status,
      seat_limit: enriched.seat_limit,
      seats_used: seatsUsed,
      seats_remaining: Math.max(0, enriched.seat_limit - seatsUsed),
      trial_ends_at: enriched.trial_ends_at || null,
      billing_email: enriched.billing_email || null,
      stripe_connected: !!(
        enriched.stripe_customer_id || enriched.stripe_subscription_id
      ),
      plans: Object.values(PLANS).map((p) => ({
        id: p.id,
        label: p.label,
        seat_limit: p.seatLimit,
        description: p.description,
      })),
    });
  } catch (error) {
    console.error("[GET /api/tenant/billing]", error);
    return NextResponse.json({ error: "Failed to load billing" }, { status: 500 });
  }
}
