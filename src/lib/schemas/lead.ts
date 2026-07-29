import { z } from 'zod';

/**
 * Lead Schema
 * Validation schema for lead data
 */

// ============================================================================
// NEW APPLICATION STAGES - Application-centric model (Phase 1)
// ============================================================================

/**
 * Official Application Stages
 * New stage system where stages are tied to Candidate + Job combinations
 */
export const APPLICATION_STAGES = [
  { value: "sourced",          label: "Sourced",           color: "gray" },
  { value: "left_message",     label: "Left Message",      color: "blue" },
  { value: "text",             label: "Text",              color: "blue" },
  { value: "email",            label: "Email",             color: "blue" },
  { value: "other",            label: "Other",             color: "gray" },
  { value: "contacted",        label: "Contacted",         color: "blue" },
  { value: "applied",          label: "Applied",           color: "sky" },
  { value: "interested",       label: "Interested",        color: "indigo" },
  { value: "pre_screened",    label: "Pre-Screened",      color: "violet" },
  { value: "submitted",        label: "Submitted",         color: "violet" },
  { value: "interviewing",      label: "Interviewing",        color: "amber" },
  { value: "second_interview", label: "2nd Interview",     color: "amber" },
  { value: "third_interview",  label: "3rd Interview",     color: "amber" },
  { value: "offer_out",        label: "Offer Out",         color: "amber" },
  { value: "offer_accepted",  label: "Offer Accepted",   color: "green" },
  { value: "offer_declined",  label: "Offer Declined",    color: "red" },
  { value: "placed",          label: "Placed",           color: "emerald" },
  { value: "rejected",        label: "Rejected",        color: "red" },
  { value: "not_interested",  label: "Not Interested",   color: "gray" },
  { value: "dnu",             label: "DNU",              color: "slate" },
] as const;

// Extract just the values for validation
export const APPLICATION_STAGE_VALUES = APPLICATION_STAGES.map(s => s.value);
export type ApplicationStage = typeof APPLICATION_STAGE_VALUES[number];

/**
 * Get stage label by value
 */
export function getStageLabel(value: string): string {
  const stage = APPLICATION_STAGES.find(s => s.value === value);
  return stage?.label || value;
}

/**
 * Get stage color by value
 */
export function getStageColor(value: string): string {
  const stage = APPLICATION_STAGES.find(s => s.value === value);
  return stage?.color || "gray";
}

/**
 * Check if a stage string is a valid application stage
 */
export function isValidApplicationStage(stage: string): stage is ApplicationStage {
  return APPLICATION_STAGE_VALUES.includes(stage as ApplicationStage);
}

/**
 * Map legacy job candidate stages to new application stages
 */
export function mapLegacyStageToApplicationStage(legacyStage: string): string {
  const mapping: Record<string, string> = {
    'Applied': 'applied',
    'applied': 'applied',
    'Screening': 'pre_screened',
    'Interviewing': 'interviewing',
    'Offered': 'offer_out',
    'Placed': 'placed',
    'Rejected': 'rejected',
    'Withdrawn': 'not_interested',
    // Legacy lead statuses
    'identification': 'sourced',
    'Identified': 'sourced',
    'identified': 'sourced',
    'outreach': 'contacted',
    'conversation': 'pre_screened',
    'presented': 'submitted',
    'interview': 'interviewing',
    'accept': 'offer_accepted',
    'new': 'sourced',
    'converted': 'placed',
    'qualified': 'pre_screened',
    'interested': 'interested',
    'Interested': 'interested',
    'not_interested': 'not_interested',
  };
  
  return mapping[legacyStage] || 'sourced';
}

// ============================================================================
// JOB-SPECIFIC NOTE SCHEMA
// ============================================================================

/**
 * Job-specific note attached to a Candidate + Job combination
 */
export const jobNoteSchema = z.object({
  id: z.string().uuid(),
  content: z.string().max(2000),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  createdByName: z.string().optional(),
  relatedStage: z.string().optional(), // The stage when this note was created
});

export type JobNote = z.infer<typeof jobNoteSchema>;

// ============================================================================
// NEW LINKED JOB STRUCTURE - For Application-centric model
// ============================================================================

/**
 * Linked job type - enhanced with stage and job-specific notes
 * This is the new structure for application-centric model
 */
export const linkedJobSchema = z.object({
  jobId: z.string(),
  jobTitle: z.string(),
  companyId: z.string().optional(),
  companyName: z.string().optional(),
  
  // Stage tracking (moved from Job.candidates[])
  stage: z.string().default("sourced"),
  stageUpdatedAt: z.string().datetime().optional(),
  stageUpdatedBy: z.string().optional(),
  
  // Job-specific notes
  notes: z.array(jobNoteSchema).default([]),

  // AI job-fit assessment (dual-written with job.candidates[])
  fitScore: z.number().min(0).max(100).optional(),
  fitGrade: z.enum(["A", "B", "C", "D", "F"]).optional(),
  fitReasons: z.array(z.string()).optional(),
  fitStrengths: z.array(z.string()).optional(),
  fitGaps: z.array(z.string()).optional(),
  fitSummary: z.string().max(4000).optional(),
  fitScoredAt: z.string().datetime().optional(),
});

// Legacy linked job type for backward compatibility during migration
export const linkedJobSchemaLegacy = z.object({
  jobId: z.string(),
  jobTitle: z.string(),
  companyName: z.string().optional(),
});

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
  // Legacy: Array of job IDs (used during migration)
  linkedJobIds: z.array(z.string()).optional(),
  // NEW: Array of linked jobs with stage and job-specific notes (application-centric model)
  linkedJobs: z.array(linkedJobSchema).optional(),
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
  company: z.string().max(200).optional().nullable(),
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
  linkedJobIds: z.array(z.string()).optional().nullable(),
  // NEW: linkedJobs with stage tracking for application-centric model
  linkedJobs: z.array(linkedJobSchema).optional().nullable(),
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
export type LinkedJob = z.infer<typeof linkedJobSchema>;
