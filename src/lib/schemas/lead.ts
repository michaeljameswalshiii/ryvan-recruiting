import { z } from 'zod';

/**
 * Lead Schema
 * Validation schema for lead data
 */

export const leadSchema = z.object({
  tenant_id: z.string().optional(),  // Set by server, not by client
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  company: z.string().max(100).optional().or(z.literal('')),
  title: z.string().max(100).optional().or(z.literal('')),
  // Pipeline stages: identification is the first/default stage for new candidates
  status: z.enum(['identification', 'outreach', 'conversation', 'presented', 'interview', 'accept', 'rejected', 'new', 'contacted', 'qualified', 'interested', 'not_interested', 'converted']).default('identification'),
  source: z.string().max(50).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  linkedin_url: z.string().max(200).optional().or(z.literal('')),
  created_at: z.string().optional(),
  modified_at: z.string().optional(),
});

// Create input
export const createLeadSchema = leadSchema.omit({ id: true });

// Update input
export const updateLeadSchema = leadSchema.partial();

// Query params schema
export const leadQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  status: z.enum(['identification', 'outreach', 'conversation', 'presented', 'interview', 'accept', 'rejected', 'new', 'contacted', 'qualified', 'interested', 'not_interested', 'converted']).optional(),
});

// Type exports
export type Lead = z.infer<typeof leadSchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
