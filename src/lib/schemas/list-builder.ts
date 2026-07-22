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

export interface ListBuilderSeedRow {
  companyName: string;
  website?: string;
  city?: string;
  contactName?: string;
  email?: string;
  phone?: string;
}

export interface ListBuilderResultRow {
  id: string;
  companyName: string;
  website?: string;
  city?: string;
  state?: string;
  industry?: string;
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
  /** User free-text brief */
  brief: string;
  industry?: string;
  geography: string;
  targetSize: number;
  /** Optional CSV-derived seed */
  seedRows: ListBuilderSeedRow[];
  results: ListBuilderResultRow[];
  progress: {
    found: number;
    target: number;
    batchesCompleted: number;
    lastMessage?: string;
    /** Companies looked at (including ones that lacked email+phone) */
    researched?: number;
    /** Consecutive batches that kept zero complete contacts */
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
  seedRows?: ListBuilderSeedRow[];
  notifyChannels?: ListBuilderNotifyChannel[];
}

/** Defaults locked with product */
export const LIST_BUILDER_DEFAULTS = {
  geography: 'United States',
  targetSize: 50,
  maxConcurrentPerUser: 10,
  timeoutMs: 2 * 60 * 60 * 1000, // 2 hours
  batchSize: 4,
  maxResultsCap: 200,
  /** Stop after this many consecutive batches with 0 kept rows */
  maxEmptyBatches: 8,
  /** Mark failed after this many consecutive hard errors */
  maxConsecutiveErrors: 3,
  /** Soft wall-clock budget per batch (leave headroom under Vercel maxDuration) */
  batchBudgetMs: 48_000,
  /** Bedrock invoke timeout */
  llmTimeoutMs: 22_000,
  /** Soft lock TTL after batch starts (shorter = less “stuck” if process dies) */
  lockMs: 55_000,
} as const;
