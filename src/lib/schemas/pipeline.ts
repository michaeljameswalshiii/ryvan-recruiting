import { z } from 'zod';

/**
 * Pipeline Schema
 * Validation schema for pipeline/candidate data
 */

export const pipelineSchema = z.object({
  tenant_id: z.string().optional(),  // Set by server, not by client
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  company: z.string().max(100).optional().or(z.literal('')),
  title: z.string().max(100).optional().or(z.literal('')),
  stage: z.enum(['new', 'screening', 'interview', 'offer', 'hired', 'rejected']).default('new'),
  source: z.string().max(50).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
linkedin_url: z.string().max(200).optional().or(z.literal('')),
  resume_url: z.string().max(200).optional().or(z.literal('')),
  scheduled_date: z.string().datetime().optional(),
  rating: z.number().min(1).max(5).optional(),
  created_at: z.string().optional(),
  modified_at: z.string().optional(),
});

// Create input
export const createPipelineSchema = pipelineSchema.omit({ id: true });

// Update input
export const updatePipelineSchema = pipelineSchema.partial();

// Query params schema
export const pipelineQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  stage: z.enum(['new', 'screening', 'interview', 'offer', 'hired', 'rejected']).optional(),
});

// Type exports
export type Pipeline = z.infer<typeof pipelineSchema>;
export type CreatePipelineInput = z.infer<typeof createPipelineSchema>;
export type UpdatePipelineInput = z.infer<typeof updatePipelineSchema>;
