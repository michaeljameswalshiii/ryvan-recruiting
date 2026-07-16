/**
 * Profile Schema
 * Zod schema for user profile data validation
 */

import { z } from "zod";
import { ROLES, type AppRole } from "@/lib/roles";

export interface Profile {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: string;
  created_at?: string;
}

/** Canonical roles + legacy aliases accepted on write */
export const appRoleSchema = z.enum([
  ROLES.SITE_ADMIN,
  ROLES.CUSTOMER_ADMIN,
  ROLES.USER,
  // legacy
  "admin",
  "member",
  "viewer",
]);

export const createProfileSchema = z.object({
  tenant_id: z.string().min(1, "Tenant ID is required"),
  email: z.string().email("Invalid email"),
  full_name: z.string().min(1, "Full name is required"),
  role: appRoleSchema.optional().default(ROLES.CUSTOMER_ADMIN),
});

export const updateProfileSchema = z.object({
  full_name: z.string().min(1).optional(),
  role: appRoleSchema.optional(),
});

export type CreateProfileInput = z.infer<typeof createProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type { AppRole };
