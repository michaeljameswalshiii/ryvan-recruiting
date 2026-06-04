import { z } from 'zod';

/**
 * Lead Schema
 * Validation schema for lead data
 */

export const leadSchema = z.object({
  tenant_id: z.string().optional(),
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  location: z.string().max(200).optional().or(z.literal('')),
  title: z.string().max(100).optional().or(z.literal('')),
  full_address: z.string().max(500).optional().or(z.literal('')),
  salary_requirements: z.string().max(100).optional().or(z.literal('')),
  summary: z.string().max(2000).optional().or(z.literal('')),
  skills: z.array(z.string()).optional(),
  experience: z.array(z.object({
    company: z.string().optional(),
    title: z.string().optional(),
    dates: z.string().optional(),
    description: z.string().optional(),
  })).optional(),
  education: z.array(z.object({
    school: z.string().optional(),
    degree: z.string().optional(),
    dates: z.string().optional(),
  })).optional(),
  certifications: z.array(z.string()).optional(),
  status: z.enum(['identification', 'outreach', 'conversation', 'presented', 'interview', 'accept', 'rejected', 'new', 'contacted', 'qualified', 'interested', 'not_interested', 'converted']).default('identification'),
  source: z.string().max(50).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  linkedin_url: z.string().max(200).optional().or(z.literal('')),
  resume_url: z.string().max(500).optional().or(z.literal('')),
  created_at: z.string().optional(),
  modified_at: z.string().optional(),
});

// Create input
export const createLeadSchema = leadSchema.omit({ id: true });

// Update input - more lenient for updates (allows empty strings, null, undefined)
export const updateLeadSchema = z.object({
  tenant_id: z.union([z.string(), z.null()]).optional(),
  id: z.string().uuid().optional(),
  name: z.string().max(100).optional(),
  email: z.string().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  title: z.string().max(100).optional().nullable(),
  full_address: z.string().max(500).optional().nullable(),
  salary_requirements: z.string().max(100).optional().nullable(),
  summary: z.string().max(2000).optional().nullable(),
  skills: z.array(z.string()).optional().nullable(),
  experience: z.array(z.record(z.string())).optional().nullable(),
  education: z.array(z.record(z.string())).optional().nullable(),
  certifications: z.array(z.string()).optional().nullable(),
  status: z.string().optional(),
  source: z.string().max(50).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  linkedin_url: z.string().max(200).optional().nullable(),
  resume_url: z.string().max(500).optional().nullable(),
  created_at: z.string().optional(),
  modified_at: z.string().optional(),
}).passthrough(); // Allow extra fields

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