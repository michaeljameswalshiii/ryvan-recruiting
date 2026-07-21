import { z } from 'zod';

/**
 * Outreach sequence schemas (email / task / LinkedIn task steps).
 * Stored in DynamoDB profiles table — no new infra.
 */

export const sequenceChannelSchema = z.enum(['email', 'task', 'linkedin_task']);
export type SequenceChannel = z.infer<typeof sequenceChannelSchema>;

export const sequenceStepSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().min(0),
  channel: sequenceChannelSchema,
  delayDays: z.number().min(0).default(0),
  subject: z.string().max(500).optional(),
  bodyTemplate: z.string().max(10000).optional(),
  taskTitle: z.string().max(500).optional(),
});
export type SequenceStep = z.infer<typeof sequenceStepSchema>;

export const sequenceDefinitionSchema = z.object({
  id: z.string().min(1),
  tenant_id: z.string().min(1),
  type: z.literal('sequence_definition').default('sequence_definition'),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  steps: z.array(sequenceStepSchema).default([]),
  active: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().optional(),
});
export type SequenceDefinition = z.infer<typeof sequenceDefinitionSchema>;

export const sequenceEnrollmentStatusSchema = z.enum([
  'active',
  'paused',
  'completed',
  'stopped',
]);
export type SequenceEnrollmentStatus = z.infer<typeof sequenceEnrollmentStatusSchema>;

export const sequenceDraftSchema = z.object({
  stepId: z.string(),
  subject: z.string().optional(),
  body: z.string().optional(),
});
export type SequenceDraft = z.infer<typeof sequenceDraftSchema>;

export const sequenceEnrollmentSchema = z.object({
  id: z.string().min(1),
  tenant_id: z.string().min(1),
  type: z.literal('sequence_enrollment').default('sequence_enrollment'),
  sequenceId: z.string().min(1),
  candidateId: z.string().min(1),
  candidateName: z.string().optional(),
  candidateEmail: z.string().optional(),
  jobId: z.string().optional(),
  jobTitle: z.string().optional(),
  status: sequenceEnrollmentStatusSchema.default('active'),
  currentStepIndex: z.number().int().min(0).default(0),
  nextRunAt: z.string(),
  lastSentAt: z.string().optional(),
  drafts: z.array(sequenceDraftSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SequenceEnrollment = z.infer<typeof sequenceEnrollmentSchema>;

export const createSequenceInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  steps: z.array(sequenceStepSchema).optional(),
  active: z.boolean().optional(),
});
export type CreateSequenceInput = z.infer<typeof createSequenceInputSchema>;

export const updateSequenceInputSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  steps: z.array(sequenceStepSchema).optional(),
  active: z.boolean().optional(),
});
export type UpdateSequenceInput = z.infer<typeof updateSequenceInputSchema>;

export const enrollCandidateInputSchema = z.object({
  candidateId: z.string().min(1),
  jobId: z.string().optional(),
});
export type EnrollCandidateInput = z.infer<typeof enrollCandidateInputSchema>;
