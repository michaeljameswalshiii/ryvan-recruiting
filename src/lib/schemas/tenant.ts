/**
 * Tenant Schema
 */

import { z } from "zod";
import { PLAN_IDS, TENANT_STATUSES } from "@/lib/plans";

export interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  created_at: string;
  updated_at?: string;
  logo_url?: string;
  primary_color?: string;
  careers_tagline?: string;
  plan?: string;
  seat_limit?: number;
  status?: string;
  trial_ends_at?: string;
  billing_email?: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  /**
   * Enterprise security policy — optional; missing = MFA off, SSO off.
   * See lib/security/tenant-security.ts
   */
  security?: {
    mfaPolicy?: string;
    ssoEnabled?: boolean;
    ssoProviderName?: string;
    ssoCognitoIdpName?: string;
    ssoNotes?: string;
    updatedAt?: string;
    updatedBy?: string;
  };
  /**
   * Default ownership for new CRM records.
   * Missing / useFixedDefaultOwner=false → creator is owner.
   * See lib/ownership/default-owner.ts
   */
  ownership?: {
    useFixedDefaultOwner?: boolean;
    defaultOwnerUserId?: string;
    updatedAt?: string;
    updatedBy?: string;
  };
  /**
   * Product configuration / customization foundation.
   * See lib/tenant-config/types.ts
   */
  product_config?: Record<string, unknown>;
}

export const createTenantSchema = z.object({
  name: z.string().min(1, "Name is required"),
  subdomain: z
    .string()
    .min(1, "Subdomain is required")
    .transform((v) => v.toLowerCase().replace(/\s+/g, "-")),
});

export const updateTenantSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  subdomain: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  // Absolute URL or app-relative path (/api/... or /branding/...)
  logo_url: z
    .string()
    .refine(
      (v) =>
        !v ||
        v.startsWith("/") ||
        v.startsWith("http://") ||
        v.startsWith("https://"),
      "Must be a URL or path"
    )
    .optional()
    .or(z.literal("")),
  primary_color: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .optional()
    .or(z.literal("")),
  careers_tagline: z.string().max(200).optional(),
  billing_email: z.string().email().optional().or(z.literal("")),
});

/** Site Admin may change plan/seats/status */
export const siteAdminUpdateTenantSchema = updateTenantSchema.extend({
  plan: z.enum(PLAN_IDS).optional(),
  seat_limit: z.number().int().min(1).max(1000).optional(),
  status: z.enum(TENANT_STATUSES).optional(),
  trial_ends_at: z.string().optional(),
});

export const tenantQuerySchema = z.object({
  limit: z.coerce.number().max(100).optional(),
  cursor: z.string().optional(),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type SiteAdminUpdateTenantInput = z.infer<
  typeof siteAdminUpdateTenantSchema
>;
