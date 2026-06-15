/**
 * Profile Schema
 * Zod schema for user profile data validation
 */

import { z } from 'zod';

export interface Profile {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: string;
  created_at?: string;
}

export const createProfileSchema = z.object({
  tenant_id: z.string().min(1, 'Tenant ID is required'),
  email: z.string().email('Invalid email'),
  full_name: z.string().min(1, 'Full name is required'),
  role: z.enum(['admin', 'member', 'viewer']).optional().default('member'),
});

export const updateProfileSchema = z.object({
  full_name: z.string().min(1).optional(),
  role: z.enum(['admin', 'member', 'viewer']).optional(),
});

export type CreateProfileInput = z.infer<typeof createProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
