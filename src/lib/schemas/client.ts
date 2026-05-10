import { z } from 'zod';

/**
 * Client Schema
 * Validation schema for client/company data
 */

export const clientSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  company: z.string().optional().or(z.literal('')),
  domain: z.string().url().optional().or(z.literal('')),
  industry: z.string().max(50).optional().or(z.literal('')),
  city: z.string().max(50).optional().or(z.literal('')),
  state: z.string().max(50).optional().or(z.literal('')),
  country: z.string().max(50).optional().or(z.literal('')),
  employee_count: z.number().int().positive().optional(),
  revenue: z.string().max(50).optional().or(z.literal('')),
  description: z.string().max(500).optional().or(z.literal('')),
  linkedin_url: z.string().url().optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

// Create input (without id - generated on server)
export const createClientSchema = clientSchema.omit({ id: true }).extend({
  // Ensure tenant_id is not provided by client
  tenant_id: z.string().optional().never(),
});

// Update input (all fields optional)
export const updateClientSchema = clientSchema.partial();

// Query params schema
export const clientQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

// Type exports
export type Client = z.infer<typeof clientSchema>;
export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
