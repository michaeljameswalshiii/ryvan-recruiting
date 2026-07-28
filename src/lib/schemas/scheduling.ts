import { z } from 'zod';

/**
 * Interview scheduling schemas for Trio ATS.
 * Stored in DynamoDB profiles table (same pattern as sequences).
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const interviewStatusSchema = z.enum([
  'link_sent',
  'pending_panel',
  'scheduled',
  'confirmed',
  'completed',
  'no_show',
  'cancelled',
  'rescheduled',
]);
export type InterviewStatus = z.infer<typeof interviewStatusSchema>;

export const interviewModeSchema = z.enum([
  'self_serve',
  'propose',
  'admin_book',
  'panel_hold',
]);
export type InterviewMode = z.infer<typeof interviewModeSchema>;

export const interviewLocationTypeSchema = z.enum([
  'video',
  'phone',
  'onsite',
  'hybrid',
]);
export type InterviewLocationType = z.infer<typeof interviewLocationTypeSchema>;

export const calendarProviderSchema = z.enum(['google', 'microsoft', 'manual']);
export type CalendarProvider = z.infer<typeof calendarProviderSchema>;

// ---------------------------------------------------------------------------
// Interviewer pool
// ---------------------------------------------------------------------------

export const poolMemberSchema = z.object({
  userId: z.string().optional(),
  email: z.string().email(),
  name: z.string().min(1).max(200),
  role: z.enum(['recruiter', 'hiring_manager', 'panelist', 'client']).default('panelist'),
  weight: z.number().min(0).max(100).default(1),
  active: z.boolean().default(true),
});
export type PoolMember = z.infer<typeof poolMemberSchema>;

export const interviewerPoolSchema = z.object({
  id: z.string().min(1),
  tenant_id: z.string().min(1),
  type: z.literal('interviewer_pool').default('interviewer_pool'),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  members: z.array(poolMemberSchema).default([]),
  /** Round-robin: pick next free member; all: require all free */
  strategy: z.enum(['round_robin', 'any_one', 'all_required']).default('round_robin'),
  /** For all_required panels: min number who must accept (optional) */
  minRequired: z.number().int().min(1).optional(),
  clientId: z.string().optional(),
  jobId: z.string().optional(),
  active: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().optional(),
});
export type InterviewerPool = z.infer<typeof interviewerPoolSchema>;

export const createPoolInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  members: z.array(poolMemberSchema).optional(),
  strategy: z.enum(['round_robin', 'any_one', 'all_required']).optional(),
  minRequired: z.number().int().min(1).optional(),
  clientId: z.string().optional(),
  jobId: z.string().optional(),
  active: z.boolean().optional(),
});
export type CreatePoolInput = z.infer<typeof createPoolInputSchema>;

// ---------------------------------------------------------------------------
// Job interview plan (stages → types → pools)
// ---------------------------------------------------------------------------

export const interviewPlanStepSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().min(0),
  name: z.string().min(1).max(200),
  durationMinutes: z.number().int().min(15).max(480).default(30),
  locationType: interviewLocationTypeSchema.default('video'),
  poolId: z.string().optional(),
  /** Pipeline stage to write when this interview is booked */
  stageOnBook: z.string().default('interviewing'),
  /** Pipeline stage when completed */
  stageOnComplete: z.string().optional(),
  scorecardRequired: z.boolean().default(true),
  bufferBeforeMinutes: z.number().int().min(0).max(120).default(5),
  bufferAfterMinutes: z.number().int().min(0).max(120).default(10),
  prepNotes: z.string().max(5000).optional(),
});
export type InterviewPlanStep = z.infer<typeof interviewPlanStepSchema>;

export const interviewPlanSchema = z.object({
  id: z.string().min(1),
  tenant_id: z.string().min(1),
  type: z.literal('interview_plan').default('interview_plan'),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  jobId: z.string().optional(),
  jobTitle: z.string().optional(),
  steps: z.array(interviewPlanStepSchema).default([]),
  active: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().optional(),
});
export type InterviewPlan = z.infer<typeof interviewPlanSchema>;

export const createPlanInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  jobId: z.string().optional(),
  jobTitle: z.string().optional(),
  steps: z.array(interviewPlanStepSchema).optional(),
  active: z.boolean().optional(),
});
export type CreatePlanInput = z.infer<typeof createPlanInputSchema>;

// ---------------------------------------------------------------------------
// Calendar connection (working hours + provider status)
// ---------------------------------------------------------------------------

export const workingHoursDaySchema = z.object({
  day: z.number().int().min(0).max(6), // 0=Sun
  enabled: z.boolean().default(true),
  start: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
  end: z.string().regex(/^\d{2}:\d{2}$/).default('17:00'),
});
export type WorkingHoursDay = z.infer<typeof workingHoursDaySchema>;

export const calendarConnectionSchema = z.object({
  id: z.string().min(1),
  tenant_id: z.string().min(1),
  type: z.literal('calendar_connection').default('calendar_connection'),
  userId: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
  provider: calendarProviderSchema.default('manual'),
  connected: z.boolean().default(false),
  timezone: z.string().default('America/New_York'),
  workingHours: z.array(workingHoursDaySchema).default([]),
  bufferMinutes: z.number().int().min(0).max(120).default(10),
  maxInterviewsPerDay: z.number().int().min(1).max(20).default(6),
  /** Busy blocks (ISO) — manual or synced */
  busyBlocks: z
    .array(
      z.object({
        start: z.string(),
        end: z.string(),
        title: z.string().optional(),
      })
    )
    .default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CalendarConnection = z.infer<typeof calendarConnectionSchema>;

export const upsertCalendarInputSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  provider: calendarProviderSchema.optional(),
  connected: z.boolean().optional(),
  timezone: z.string().optional(),
  workingHours: z.array(workingHoursDaySchema).optional(),
  bufferMinutes: z.number().int().min(0).max(120).optional(),
  maxInterviewsPerDay: z.number().int().min(1).max(20).optional(),
  busyBlocks: z
    .array(
      z.object({
        start: z.string(),
        end: z.string(),
        title: z.string().optional(),
      })
    )
    .optional(),
});
export type UpsertCalendarInput = z.infer<typeof upsertCalendarInputSchema>;

// ---------------------------------------------------------------------------
// Self-schedule link + interview
// ---------------------------------------------------------------------------

export const scheduleLinkSchema = z.object({
  id: z.string().min(1),
  tenant_id: z.string().min(1),
  type: z.literal('schedule_link').default('schedule_link'),
  token: z.string().min(8),
  candidateId: z.string().min(1),
  candidateName: z.string().optional(),
  candidateEmail: z.string().optional(),
  jobId: z.string().optional(),
  jobTitle: z.string().optional(),
  planId: z.string().optional(),
  planStepId: z.string().optional(),
  poolId: z.string().optional(),
  interviewTypeName: z.string().default('Interview'),
  durationMinutes: z.number().int().min(15).max(480).default(30),
  locationType: interviewLocationTypeSchema.default('video'),
  stageOnBook: z.string().default('interviewing'),
  mode: interviewModeSchema.default('self_serve'),
  /** Proposed slots when mode=propose */
  proposedSlots: z
    .array(z.object({ start: z.string(), end: z.string() }))
    .optional(),
  expiresAt: z.string(),
  singleUse: z.boolean().default(true),
  usedAt: z.string().optional(),
  maxReschedules: z.number().int().min(0).max(10).default(3),
  minNoticeHours: z.number().min(0).max(168).default(4),
  enrollmentId: z.string().optional(),
  sequenceId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().optional(),
});
export type ScheduleLink = z.infer<typeof scheduleLinkSchema>;

export const createScheduleLinkInputSchema = z.object({
  candidateId: z.string().min(1),
  candidateName: z.string().optional(),
  candidateEmail: z.string().email().optional().or(z.literal('')),
  jobId: z.string().optional(),
  jobTitle: z.string().optional(),
  planId: z.string().optional(),
  planStepId: z.string().optional(),
  poolId: z.string().optional(),
  interviewTypeName: z.string().max(200).optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  locationType: interviewLocationTypeSchema.optional(),
  stageOnBook: z.string().optional(),
  mode: interviewModeSchema.optional(),
  proposedSlots: z
    .array(z.object({ start: z.string(), end: z.string() }))
    .optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
  singleUse: z.boolean().optional(),
  maxReschedules: z.number().int().min(0).max(10).optional(),
  minNoticeHours: z.number().min(0).max(168).optional(),
  enrollmentId: z.string().optional(),
  sequenceId: z.string().optional(),
});
export type CreateScheduleLinkInput = z.infer<typeof createScheduleLinkInputSchema>;

export const interviewParticipantSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  role: z.enum(['recruiter', 'hiring_manager', 'panelist', 'client', 'candidate']),
  userId: z.string().optional(),
  status: z.enum(['pending', 'accepted', 'declined', 'tentative']).default('pending'),
  isHold: z.boolean().default(false),
});
export type InterviewParticipant = z.infer<typeof interviewParticipantSchema>;

export const interviewSchema = z.object({
  id: z.string().min(1),
  tenant_id: z.string().min(1),
  type: z.literal('interview').default('interview'),
  linkId: z.string().optional(),
  linkToken: z.string().optional(),
  candidateId: z.string().min(1),
  candidateName: z.string().optional(),
  candidateEmail: z.string().optional(),
  jobId: z.string().optional(),
  jobTitle: z.string().optional(),
  planId: z.string().optional(),
  planStepId: z.string().optional(),
  poolId: z.string().optional(),
  title: z.string().min(1).max(300),
  status: interviewStatusSchema.default('scheduled'),
  mode: interviewModeSchema.default('self_serve'),
  locationType: interviewLocationTypeSchema.default('video'),
  locationDetail: z.string().max(1000).optional(),
  conferenceUrl: z.string().optional(),
  startAt: z.string(),
  endAt: z.string(),
  timezone: z.string().default('America/New_York'),
  durationMinutes: z.number().int().min(15).max(480),
  participants: z.array(interviewParticipantSchema).default([]),
  stageOnBook: z.string().optional(),
  stageWritten: z.string().optional(),
  scorecardRequired: z.boolean().default(true),
  scorecardCompleted: z.boolean().default(false),
  rescheduleCount: z.number().int().min(0).default(0),
  noShowRecovered: z.boolean().optional(),
  recoveryLinkToken: z.string().optional(),
  notes: z.string().max(5000).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().optional(),
  completedAt: z.string().optional(),
  cancelledAt: z.string().optional(),
  cancelReason: z.string().optional(),
});
export type Interview = z.infer<typeof interviewSchema>;

export const bookInterviewInputSchema = z.object({
  token: z.string().min(8),
  startAt: z.string().min(1),
  timezone: z.string().default('America/New_York'),
  candidateName: z.string().optional(),
  candidateEmail: z.string().email().optional(),
  notes: z.string().max(2000).optional(),
});
export type BookInterviewInput = z.infer<typeof bookInterviewInputSchema>;

export const adminBookInputSchema = z.object({
  candidateId: z.string().min(1),
  candidateName: z.string().optional(),
  candidateEmail: z.string().optional(),
  jobId: z.string().optional(),
  jobTitle: z.string().optional(),
  planId: z.string().optional(),
  planStepId: z.string().optional(),
  poolId: z.string().optional(),
  title: z.string().min(1).max(300).optional(),
  startAt: z.string().min(1),
  durationMinutes: z.number().int().min(15).max(480).default(30),
  timezone: z.string().default('America/New_York'),
  locationType: interviewLocationTypeSchema.optional(),
  locationDetail: z.string().optional(),
  stageOnBook: z.string().optional(),
  participantEmails: z.array(z.string().email()).optional(),
  notes: z.string().optional(),
});
export type AdminBookInput = z.infer<typeof adminBookInputSchema>;

export const updateInterviewInputSchema = z.object({
  status: interviewStatusSchema.optional(),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  notes: z.string().optional(),
  scorecardCompleted: z.boolean().optional(),
  cancelReason: z.string().optional(),
  conferenceUrl: z.string().optional(),
  locationDetail: z.string().optional(),
});
export type UpdateInterviewInput = z.infer<typeof updateInterviewInputSchema>;

// ---------------------------------------------------------------------------
// Client interviewer portal
// ---------------------------------------------------------------------------

export const clientPortalSchema = z.object({
  id: z.string().min(1),
  tenant_id: z.string().min(1),
  type: z.literal('client_portal').default('client_portal'),
  token: z.string().min(8),
  clientId: z.string().optional(),
  clientName: z.string().min(1).max(200),
  contactEmail: z.string().email(),
  contactName: z.string().optional(),
  jobIds: z.array(z.string()).default([]),
  poolId: z.string().optional(),
  timezone: z.string().default('America/New_York'),
  /** Availability the client submitted */
  availability: z
    .array(
      z.object({
        start: z.string(),
        end: z.string(),
      })
    )
    .default([]),
  active: z.boolean().default(true),
  expiresAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().optional(),
});
export type ClientPortal = z.infer<typeof clientPortalSchema>;

export const createClientPortalInputSchema = z.object({
  clientId: z.string().optional(),
  clientName: z.string().min(1).max(200),
  contactEmail: z.string().email(),
  contactName: z.string().optional(),
  jobIds: z.array(z.string()).optional(),
  poolId: z.string().optional(),
  timezone: z.string().optional(),
  expiresInDays: z.number().int().min(1).max(90).default(30),
});
export type CreateClientPortalInput = z.infer<typeof createClientPortalInputSchema>;

// ---------------------------------------------------------------------------
// Analytics (computed, not stored)
// ---------------------------------------------------------------------------

export type SchedulingAnalytics = {
  totalInterviews: number;
  scheduled: number;
  completed: number;
  noShows: number;
  cancelled: number;
  noShowRate: number;
  selfServeRate: number;
  avgRescheduleCount: number;
  openLinks: number;
  upcoming7d: number;
  byStatus: Record<string, number>;
  byMode: Record<string, number>;
  interviewerLoad: { email: string; name?: string; count: number }[];
};
