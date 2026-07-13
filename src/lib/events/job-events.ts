/**
 * Job Events Service
 * Records and retrieves job events (created, updated, candidate linked) from DynamoDB
 * 
 * @serverOnly
 */

'use server';

import { putItem, queryItems, eventsTable } from '../db/dynamodb';
import type {
  EventDetails,
  CandidateEvent,
  CandidateEventResult,
  GetEventsResponse,
  RecordEventResponse,
  PaginationCursor,
} from './types';

// ============================================================================
// Job Event Types
// ============================================================================

export type JobEventType =
  | 'JOB_CREATED'
  | 'JOB_UPDATED'
  | 'JOB_DELETED'
  | 'JOB_STATUS_CHANGED'
  | 'CANDIDATE_LINKED'
  | 'CANDIDATE_UNLINKED'
  | 'CANDIDATE_STAGE_CHANGED'
  | 'NOTE';

// ============================================================================
// Constants & Configuration
// ============================================================================

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 100;

// ============================================================================
// Structured Logging
// ============================================================================

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function logEvent(
  level: LogLevel,
  message: string,
  meta?: {
    jobId?: string;
    eventType?: string;
    error?: Error;
    [key: string]: unknown;
  }
): void {
  const timestamp = new Date().toISOString();
  
  switch (level) {
    case 'error':
      console.error(`[JOB_EVENTS] ${message}`, JSON.stringify(meta));
      break;
    case 'warn':
      console.warn(`[JOB_EVENTS] ${message}`, JSON.stringify(meta));
      break;
    case 'debug':
      console.debug(`[JOB_EVENTS] ${message}`, JSON.stringify(meta));
      break;
    default:
      console.log(`[JOB_EVENTS] ${message}`, JSON.stringify(meta));
  }
}

// ============================================================================
// Retry Logic
// ============================================================================

async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = MAX_RETRY_ATTEMPTS,
  baseDelay: number = RETRY_BASE_DELAY_MS
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logEvent('warn', `Attempt ${attempt}/${maxAttempts} failed`, { error: lastError });
      
      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Operation failed after retries');
}

/**
 * Get session tenant ID for event recording
 */
async function getEventTenantId(): Promise<string> {
  const { getSessionTenantId, getSessionUserId } = await import('../server-auth');
  const tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  
  if (!tenantId && userId) {
    return `tenant-${userId}`;
  }
  
  return tenantId || 'default-tenant';
}

/**
 * Record an event for a job
 * 
 * @param jobId - The job ID
 * @param eventType - Type of event
 * @param details - Event details (title, description, metadata)
 * @param createdBy - User email or ID who created the event
 * @returns Result with success status and event ID
 */
export async function recordJobEvent(
  jobId: string,
  eventType: JobEventType,
  details: EventDetails,
  createdBy: string
): Promise<RecordEventResponse> {
  try {
    const timestamp = new Date().toISOString();
    const
