/**
 * Profile Schema
 */

import { z } from "zod";
import { ROLES, type AppRole } from "@/lib/roles";

export const MEMBER_STATUSES = ["active", "invited", "disabled"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export interface Profile {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: string;
  created_at?: string;
  updated_at?: string;
  status?: MemberStatus | string;
  invited_at?: string;
  invited_by?: string;
  invite_token_hash?: string;
  invite_expires_at?: string;
  password_hash?: string;
}

export const appRoleSchema = z.enum([
  ROLES.SITE_ADMIN,
  ROLES.CUSTOMER_ADMIN,
  ROLES.USER,
  "admin",
  "member",
  "viewer",
]);

export const createProfileSchema = z.object({
  tenant_id: z.string().min(1, "Tenant ID is required"),
  email: z.string().email("Invalid email"),
  full_name: z.string().min(1, "Full name is required"),
  role: appRoleSchema.optional().default(ROLES.USER),
});

export const updateProfileSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  role: appRoleSchema.optional(),
  status: z.enum(MEMBER_STATUSES).optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1).max(100).optional(),
  role: z.enum([ROLES.USER, ROLES.CUSTOMER_ADMIN]).default(ROLES.USER),
});

export type CreateProfileInput = z.infer<typeof createProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type { AppRole };
