/**
 * BD List Builder job types
 * Background agent that finds companies + contacts for outreach.
 */

export const LIST_BUILDER_STATUSES = [
  'queued',
  'running',
  'paused',
  'completed',
  'cancelled',
  'failed',
  'awaiting_import',
] as const;

export type ListBuilderStatus = (typeof LIST_BUILDER_STATUSES)[number];

export type ListBuilderNotifyChannel = 'in_app' | 'email';

/**
 * private — only the owner (userId) can see the job in their queue and open results.
 * public  — any team member on the same tenant can see the list, open results, and import.
 * Control actions (pause/cancel/delete) stay owner-only.
 */
export const LIST_BUILDER_VISIBILITIES = ['private', 'public'] as const;
export type ListBuilderVisibility = (typeof LIST_BUILDER_VISIBILITIES)[number];

export interface ListBuilderSeedRow {
  companyName: string;
  website?: string;
  city?: string;
  contactName?: string;
  email?: string;
  phone?: string;
}

/** complete = email + phone; partial = email or phone only (still importable) */
export type ListBuilderContactCompleteness = 'complete' | 'partial';

/**
 * Quality tier after site + geo gates:
 * - verified: live site + geo evidence + contact
 * - partial: live site + contact, geo unconfirmed
 * - unverified: should rarely be kept (legacy / seed)
 */
export type ListBuilderVerificationStatus =
  | 'verified'
  | 'partial'
  | 'unverified';

export interface ListBuilderResultRow {
  id: string;
  companyName: string;
  website?: string;
  city?: string;
  state?: string;
  /** Homepage resolved and returned HTTP 2xx */
  siteVerified?: boolean;
  /** City field and/or page text supports target geography */
  geoVerified?: boolean;
  verificationStatus?: ListBuilderVerificationStatus;
  verificationNotes?: string;
  /** Maps to client.industry on import */
  industry?: string;
  /**
   * Estimated headcount when a number is known.
   * Maps to client.employee_count on import.
   */
  employeeCount?: number;
  /**
   * Size label/band (e.g. "120" or "51-200").
   * Maps to client.company_size on import; also used when only a range is known.
   */
  companySize?: string;
  /**
   * Open job postings observed (careers page, etc.).
   * Maps to client.open_jobs_posted on import. Optional — never invent.
   */
  openJobsPosted?: number;
  contactName?: string;
  contactTitle?: string;
  email?: string;
  phone?: string;
  sourceUrl?: string;
  /** Existing Trio company id when matched */
  existingCompanyId?: string;
  /** True if company already in Trio */
  companyExists?: boolean;
  notes?: string;
  /** email+phone vs email-or-phone only */
  contactCompleteness?: ListBuilderContactCompleteness;
  selected?: boolean;
  imported?: boolean;
  importedCompanyId?: string;
  importedContactId?: string;
  createdAt: string;
}

export interface ListBuilderJob {
  id: string;
  tenant_id: string;
  userId: string;
  type: 'list_builder';
  status: ListBuilderStatus;
  /**
   * Sharing within the tenant. Defaults to private for older jobs missing the field.
   */
  visibility: ListBuilderVisibility;
  /** User free-text brief */
  brief: string;
  industry?: string;
  geography: string;
  targetSize: number;
  /** Optional CSV-derived seed */
  seedRows: ListBuilderSeedRow[];
  results: ListBuilderResultRow[];
  progress: {
    /** Kept rows (complete + partial with email or phone) */
    found: number;
    target: number;
    batchesCompleted: number;
    lastMessage?: string;
    /** Companies looked at (including ones dropped with no contact) */
    researched?: number;
    /** Kept rows that have both email and phone */
    completeFound?: number;
    /** Kept rows that have only email or only phone */
    partialFound?: number;
    /** Consecutive batches that kept zero usable contacts */
    emptyBatchStreak?: number;
    /** Consecutive batch failures (LLM/infra) */
    errorStreak?: number;
  };
  /** In-app now; email reserved */
  notifyChannels: ListBuilderNotifyChannel[];
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  /** Hard stop after this ISO time (2h default from create) */
  expiresAt: string;
  /** Cursor for seed processing */
  seedCursor: number;
  /** LLM suggestion offset / batch index */
  discoveryBatch: number;
  /** Soft lock so concurrent tick/cron don't double-run a batch */
  lockedUntil?: string;
}

export interface CreateListBuilderInput {
  brief: string;
  industry?: string;
  geography?: string;
  targetSize?: number;
  /** private (default) or public (shared with all users on the tenant) */
  visibility?: ListBuilderVisibility;
  seedRows?: ListBuilderSeedRow[];
  notifyChannels?: ListBuilderNotifyChannel[];
}

/** Defaults locked with product */
export const LIST_BUILDER_DEFAULTS = {
  geography: 'United States',
  targetSize: 50,
  /** Default list sharing — private unless user opts into public */
  visibility: 'private' as ListBuilderVisibility,
  maxConcurrentPerUser: 10,
  timeoutMs: 2 * 60 * 60 * 1000, // 2 hours
  /**
   * Companies per tick. Keep modest when Grok browse (fetch_website) is enabled
   * so the batch fits under Vercel maxDuration.
   */
  batchSize: 4,
  /** Hard cap on companies per job (UI + API clamp). */
  maxResultsCap: 100,
  /**
   * Soft empty-batch signal for UI only — do NOT stop the job early.
   * Jobs run until target kept leads, hard error streak, or 2h timeout.
   */
  maxEmptyBatches: 8,
  /** Safety cap on discovery batches (target + timeout are primary stops) */
  maxDiscoveryBatches: 400,
  /** Mark failed after this many consecutive hard errors */
  maxConsecutiveErrors: 3,
  /**
   * Soft wall-clock budget per batch.
   * Grok web_search is slower than pure LLM — allow more room under maxDuration 60s.
   */
  batchBudgetMs: 55_000,
  /** Grok / LLM invoke timeout (discovery with web_search needs longer) */
  llmTimeoutMs: 50_000,
  /** Soft lock TTL after batch starts (shorter = less “stuck” if process dies) */
  lockMs: 55_000,
  /**
   * Max companies per import API request (client loops until all selected are done).
   * Keeps each Vercel invocation well under maxDuration.
   */
  importBatchSize: 12,
} as const;
