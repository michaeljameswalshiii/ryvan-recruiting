import { z } from 'zod';

/**
 * Job Candidate Stage Enum
 * Stages a candidate can be in for a specific job
 */
export const jobCandidateStages = [
  'Applied',
  'Screening',
  'Interviewing',
  'Offered',
  'Placed',
  'Rejected',
  'Withdrawn',
] as const;

export type JobCandidateStage = typeof jobCandidateStages[number];

/**
 * Job Status Enum
 * Overall status of the job posting
 */
export const jobStatuses = ['Open', 'On Hold', 'Closed'] as const;
export type JobStatus = typeof jobStatuses[number];

/**
 * Linked Candidate Schema
 * A candidate linked to a job with their stage
 */
export const linkedCandidateSchema = z.object({
  candidateId: z.string().uuid(),
  candidateName: z.string(),
  candidateEmail: z.string().email().optional(),
  stage: z.enum(jobCandidateStages),
  dateApplied: z.string().datetime(),
  notes: z.string().max(1000).optional(),
});

export type LinkedCandidate = z.infer<typeof linkedCandidateSchema>;

/**
 * Job Schema
 * Main job postings that link companies and candidates
 */
export const jobSchema = z.object({
  tenant_id: z.string().optional(),
  id: z.string().uuid().optional(),
  
  // Job details
  title: z.string().min(1, 'Job title is required').max(200),
  description: z.string().max(5000).optional(),
  location: z.string().max(200).optional(),
  salaryRange: z.string().max(100).optional(),
  employmentType: z.enum(['Full-time', 'Part-time', 'Contract', 'Internship']).default('Full-time'),
  
  // Company link
  companyId: z.string().uuid().optional(),
  companyName: z.string().max(200).optional(),
  
  // Job status
  status: z.enum(jobStatuses).default('Open'),
  
  // Linked candidates
  candidates: z.array(linkedCandidateSchema).default([]),
  
  // Timestamps
  created_at: z.string().datetime().optional(),
  modified_at: z.string().datetime().optional(),
});

/**
 * Create Job Input Schema
 */
export const createJobSchema = jobSchema.omit({ 
  id: true, 
  candidates: true, 
  created_at: true, 
  modified_at: true 
}).extend({
  companyId: z.string().min(1, 'Company ID is required'),  // Allow any string (not just UUID)
  companyName: z.string().min(1, 'Company name is required'),
});

/**
 * Update Job Input Schema
 */
export const updateJobSchema = jobSchema.partial().omit({
  tenant_id: true,
  id: true,
  candidates: true, // Use separate endpoints for candidate management
  created_at: true,
});

/**
 * Link Candidate to Job Schema
 */
export const linkCandidateToJobSchema = z.object({
  candidateId: z.string().uuid(),
  candidateName: z.string().min(1),
  candidateEmail: z.string().email().optional(),
  stage: z.enum(jobCandidateStages).default('Applied'),
  notes: z.string().max(1000).optional(),
});

/**
 * Update Candidate Stage Schema
 */
export const updateCandidateStageSchema = z.object({
  candidateId: z.string().uuid(),
  stage: z.enum(jobCandidateStages),
  notes: z.string().max(1000).optional(),
});

// Type exports
export type Job = z.infer<typeof jobSchema>;
export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type LinkCandidateInput = z.infer<typeof linkCandidateToJobSchema>;
export type UpdateCandidateStageInput = z.infer<typeof updateCandidateStageSchema>;
