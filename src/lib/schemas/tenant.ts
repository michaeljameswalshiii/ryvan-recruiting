/**
 * Tenant Schema
 * Zod schema for tenant data validation
 */

import { z } from 'zod';

export interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  created_at: string;
}

export const createTenantSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  subdomain: z.string().min(1, 'Subdomain is required').transform(v => v.toLowerCase().replace(/\s+/g, '-')),
});

export const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  subdomain: z.string().min(1).optional(),
});

export const tenantQuerySchema = z.object({
  limit: z.coerce.number().max(100).optional(),
  cursor: z.string().optional(),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
