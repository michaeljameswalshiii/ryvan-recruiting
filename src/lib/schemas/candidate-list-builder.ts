/**
 * Candidate List Builder job types
 * Looping agent that sources people via People Data Labs (AWS Data Exchange / direct API).
 */

export const CANDIDATE_LIST_BUILDER_STATUSES = [
  'queued',
  'running',
  'paused',
  'completed',
  'cancelled',
  'failed',
  'awaiting_import',
] as const;

export type CandidateListBuilderStatus =
  (typeof CANDIDATE_LIST_BUILDER_STATUSES)[number];

export type CandidateListBuilderNotifyChannel = 'in_app' | 'email';

export const CANDIDATE_LIST_BUILDER_VISIBILITIES = ['private', 'public'] as const;
export type CandidateListBuilderVisibility =
  (typeof CANDIDATE_LIST_BUILDER_VISIBILITIES)[number];

/**
 * complete = email + phone
 * partial = email or phone or linkedin only
 */
export type CandidateContactCompleteness = 'complete' | 'partial' | 'profile';

export interface CandidateListBuilderResultRow {
  id: string;
  pdlId?: string;
  name: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  city?: string;
  state?: string;
  country?: string;
  location?: string;
  industry?: string;
  skills?: string[];
  contactCompleteness?: CandidateContactCompleteness;
  /** Already in Trio leads */
  existingLeadId?: string;
  leadExists?: boolean;
  notes?: string;
  selected?: boolean;
  imported?: boolean;
  importedLeadId?: string;
  createdAt: string;
}

export interface CandidateListBuilderJob {
  id: string;
  tenant_id: string;
  userId: string;
  type: 'candidate_list_builder';
  status: CandidateListBuilderStatus;
  visibility: CandidateListBuilderVisibility;
  brief: string;
  geography: string;
  targetSize: number;
  /** Parsed / explicit titles */
  titles: string[];
  industries: string[];
  companies: string[];
  keywords: string[];
  results: CandidateListBuilderResultRow[];
  progress: {
    found: number;
    target: number;
    batchesCompleted: number;
    lastMessage?: string;
    researched?: number;
    completeFound?: number;
    partialFound?: number;
    emptyBatchStreak?: number;
    errorStreak?: number;
    /** PDL scroll token for next page */
    scrollToken?: string;
    /** Cumulative estimated USD (PDL credits) */
    estimatedCostUsd?: number;
    /** PDL API calls this job */
    pdlCalls?: number;
    /** People returned by PDL (before filters) */
    pdlReturned?: number;
  };
  notifyChannels: CandidateListBuilderNotifyChannel[];
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  expiresAt: string;
  discoveryBatch: number;
  lockedUntil?: string;
}

export interface CreateCandidateListBuilderInput {
  brief: string;
  geography?: string;
  targetSize?: number;
  titles?: string[];
  industries?: string[];
  companies?: string[];
  keywords?: string[];
  visibility?: CandidateListBuilderVisibility;
  notifyChannels?: CandidateListBuilderNotifyChannel[];
}

export const CANDIDATE_LIST_BUILDER_DEFAULTS = {
  geography: 'United States',
  targetSize: 50,
  visibility: 'private' as CandidateListBuilderVisibility,
  maxConcurrentPerUser: 10,
  timeoutMs: 2 * 60 * 60 * 1000, // 2 hours
  /** People requested per PDL page */
  batchSize: 25,
  maxResultsCap: 100,
  /** Stop after this many consecutive empty/filtered pages */
  maxEmptyBatches: 8,
  maxDiscoveryBatches: 40,
  maxConsecutiveErrors: 3,
  lockMs: 55_000,
  importBatchSize: 15,
} as const;
