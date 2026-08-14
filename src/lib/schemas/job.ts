import { z } from 'zod';
import {
  normalizeJobStatus,
  JOB_STATUSES as JOB_STATUS_VALUES,
} from '@/lib/jobs/status';

// Re-export helpers so callers can import from schema or jobs/status
export {
  normalizeJobStatus,
  isJobOpenForCareers,
  jobStatusBadgeClasses,
  JOB_STATUSES,
  JOB_STATUS_META,
} from '@/lib/jobs/status';

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
 * Open | Paused | Filled | Lost | Closed
 * (legacy "On Hold" / OPEN / PAUSED normalize via jobStatusField)
 */
export const jobStatuses = JOB_STATUS_VALUES;
export type JobStatus = (typeof jobStatuses)[number];

/** Accepts legacy values (On Hold, OPEN, …) and coerces to canonical */
export const jobStatusField = z.preprocess(
  (val) => normalizeJobStatus(typeof val === 'string' ? val : 'Open'),
  z.enum(jobStatuses as unknown as [string, ...string[]])
);

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
  // AI job-fit assessment (source of truth on the job↔candidate link)
  fitScore: z.number().min(0).max(100).optional(),
  fitGrade: z.enum(["A", "B", "C", "D", "F"]).optional(),
  fitDomainScore: z.number().min(0).max(100).optional(),
  fitDomainGrade: z.enum(["A", "B", "C", "D", "F"]).optional(),
  fitToolScore: z.number().min(0).max(100).optional(),
  fitToolGrade: z.enum(["A", "B", "C", "D", "F"]).optional(),
  fitToolApplicable: z.boolean().optional(),
  fitReasons: z.array(z.string()).optional(),
  fitStrengths: z.array(z.string()).optional(),
  fitGaps: z.array(z.string()).optional(),
  fitSummary: z.string().max(4000).optional(),
  fitScoredAt: z.string().datetime().optional(),
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
  // Full job descriptions are often long JDs; keep a high ceiling, not a paste blocker
  description: z.preprocess(
    (val) => (val === null || val === undefined ? undefined : val),
    z.string().max(50000).optional()
  ),
  location: z.preprocess(
    (val) => (val === null || val === undefined ? undefined : val),
    z.string().max(200).optional()
  ),
  salaryRange: z.preprocess(
    (val) => (val === null || val === undefined ? undefined : val),
    z.string().max(100).optional()
  ),
  employmentType: z.preprocess(
    (val) => {
      if (val === null || val === undefined) return 'Full-time';
      if (typeof val === 'string' && val.trim() === '') return 'Full-time';
      return val;
    },
    z.enum(['Full-time', 'Part-time', 'Contract', 'Internship']).default('Full-time')
  ),
  
  // Company link (ids may be legacy non-UUIDs)
  companyId: z.string().min(1).optional(),
  companyName: z.string().max(200).optional(),

  /**
   * Hiring manager / primary contact for this req (usually a company contact).
   * Denormalized name/email/title so the job page works even if contact list changes.
   */
  hiringManagerContactId: z.string().optional().or(z.literal('')),
  hiringManagerName: z.string().max(100).optional().or(z.literal('')),
  hiringManagerTitle: z.string().max(100).optional().or(z.literal('')),
  hiringManagerEmail: z.string().max(200).optional().or(z.literal('')),
  hiringManagerPhone: z.string().max(50).optional().or(z.literal('')),

  /** Placement fee for this req. Inherited from the company when a new job is created. */
  fee_percent: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined) return undefined;
      const n = typeof val === 'number' ? val : Number(val);
      return Number.isFinite(n) ? n : undefined;
    },
    z.number().min(0).max(100).optional()
  ),
  fee_type: z.string().max(40).optional().or(z.literal('')),
  fee_guarantee: z.string().max(80).optional().or(z.literal('')),
  
  // Job status (legacy values normalized)
  status: jobStatusField.default('Open'),

  /**
   * When true, Open jobs appear on public /careers feed and embeds.
   * When false, job stays internal even if Open.
   * Undefined (legacy): treated as true so existing public jobs keep showing.
   */
  showOnWebsite: z.boolean().optional(),

  /**
   * Optional pre-screen questions shown on the public careers apply form.
   * Answers are evaluated by the screen-bot on submit.
   */
  preScreenQuestions: z
    .array(
      z.object({
        id: z.string(),
        prompt: z.string().max(500),
        type: z.enum(['text', 'yes_no', 'number', 'choice']).default('text'),
        options: z.array(z.string()).optional(),
        required: z.boolean().optional().default(true),
      })
    )
    .optional(),
  
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
 * Accepts application stages (sourced, etc.) and legacy job stages.
 * candidateId can be any non-empty id (not all legacy ids are UUIDs).
 */
export const linkCandidateToJobSchema = z.object({
  candidateId: z.string().min(1, 'Candidate is required'),
  candidateName: z.string().min(1),
  candidateEmail: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().email().optional()
  ),
  stage: z.string().min(1).default('sourced'),
  notes: z.string().max(1000).optional(),
});

/**
 * Update Candidate Stage Schema
 */
export const updateCandidateStageSchema = z.object({
  candidateId: z.string().min(1),
  stage: z.string().min(1),
  notes: z.string().max(1000).optional(),
});

// Type exports
export type Job = z.infer<typeof jobSchema>;
export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
export type LinkCandidateInput = z.infer<typeof linkCandidateToJobSchema>;
export type UpdateCandidateStageInput = z.infer<typeof updateCandidateStageSchema>;
