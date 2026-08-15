export const RECRUITER_RUN_STATUSES = [
  'queued',
  'running',
  'paused',
  'completed',
  'cancelled',
  'failed',
] as const;

export type RecruiterRunStatus = (typeof RECRUITER_RUN_STATUSES)[number];

export type RecruiterLocationRadius = 'exact' | '10' | '25' | '50' | '100' | 'state' | 'anywhere';

export type RecruiterCandidateFeedback = {
  decision: 'strong_fit' | 'not_fit' | 'wrong_location' | 'wrong_seniority' | 'contacted' | 'saved';
  reason?: string;
  updatedAt: string;
  userId: string;
};

export interface RecruiterRun {
  id: string;
  tenant_id: string;
  userId: string;
  type: 'recruiter_agent_run';
  status: RecruiterRunStatus;
  query: string;
  location?: string;
  jobId?: string;
  locationRadius: RecruiterLocationRadius;
  radiusMiles?: number;
  progressiveWidening: boolean;
  wideningStage: number;
  wideningHistory: Array<{
    from: RecruiterLocationRadius;
    to: RecruiterLocationRadius;
    at: string;
    reason: string;
  }>;
  feedback: Record<string, RecruiterCandidateFeedback>;
  visibility: 'private' | 'public';
  targetQualified: number;
  minFitScore: number;
  batchSize: number;
  pageOffset: number;
  candidates: any[];
  qualifiedCount: number;
  estimatedCostUsd: number;
  notes: string[];
  apolloPlan?: Record<string, unknown>;
  apolloPlanSource?: string;
  fillRunId?: string;
  lastMessage?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  lockedUntil?: string;
}
