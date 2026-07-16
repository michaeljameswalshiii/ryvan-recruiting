/**
 * Commercial packaging (Stripe-ready; no live payments required).
 */

export const PLAN_IDS = ["free", "starter", "growth", "enterprise"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const TENANT_STATUSES = [
  "active",
  "trial",
  "suspended",
  "cancelled",
] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export type PlanDefinition = {
  id: PlanId;
  label: string;
  seatLimit: number;
  description: string;
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    label: "Free",
    seatLimit: 3,
    description: "Solo or tiny team — core ATS",
  },
  starter: {
    id: "starter",
    label: "Starter",
    seatLimit: 10,
    description: "Small agency — team invites + careers branding",
  },
  growth: {
    id: "growth",
    label: "Growth",
    seatLimit: 25,
    description: "Growing firm — higher seat limit",
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    seatLimit: 100,
    description: "Custom limits and support",
  },
};

export function normalizePlanId(raw: string | null | undefined): PlanId {
  const p = (raw || "").trim().toLowerCase();
  if (p in PLANS) return p as PlanId;
  return "free";
}

export function normalizeTenantStatus(
  raw: string | null | undefined
): TenantStatus {
  const s = (raw || "").trim().toLowerCase();
  if ((TENANT_STATUSES as readonly string[]).includes(s)) {
    return s as TenantStatus;
  }
  return "active";
}

export function defaultSeatLimit(plan: PlanId): number {
  return PLANS[plan].seatLimit;
}

export function planLabel(plan: string | null | undefined): string {
  return PLANS[normalizePlanId(plan)].label;
}
