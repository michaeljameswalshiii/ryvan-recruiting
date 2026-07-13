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
    const eventId = `${jobId}-${timestamp}`;
    
    const tenantId = await getEventTenantId();

    const event: any = {
      PK: `ENTITY#job#${jobId}`,
      SK: `EVENT#${timestamp}`,
      GSI1PK: `TENANT#${tenantId}`,
      GSI1SK: `EVENT#${timestamp}`,
      tenantId,
      entityId: jobId,
      entityType: 'job',
      eventType,
      title: details.title,
      description: details.description,
      metadata: details.metadata || {},
      createdAt: timestamp,
      createdBy,
    };

    await putItem(eventsTable, event);

    return {
      success: true,
      eventId,
    };
  } catch (error) {
    console.error('[JOB_EVENTS] Failed to record event:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record event',
    };
  }
}

/**
 * Get all events for a job with optional filtering and pagination
 */
export async function getJobEvents(
  jobId: string,
  options?: {
    limit?: number;
    cursor?: PaginationCursor;
    eventTypes?: JobEventType[];
  }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  try {
    const { limit, cursor, eventTypes } = options || {};
    
    let queryExpr = 'PK = :pk AND begins_with(SK, :skPrefix)';
    const exprValues: Record<string, string> = {
      ':pk': `ENTITY#job#${jobId}`,   // ✅ FIXED - was JOB#
      ':skPrefix': 'EVENT#',
    };

    if (cursor) {
      queryExpr += ' AND SK < :cursorSK';
      exprValues[':cursorSK'] = cursor.timestamp;
    }

    const events = await queryItems<any>(
      eventsTable,
      queryExpr,
      exprValues
    );

    // Sort by timestamp descending
    const sortedEvents = events.sort((a, b) => 
      b.SK.localeCompare(a.SK)
    );

    // Filter by event types if provided
    let filteredEvents = sortedEvents;
    if (eventTypes && eventTypes.length > 0) {
      filteredEvents = sortedEvents.filter(event => 
        eventTypes.includes(event.eventType as JobEventType)
      );
    }

    const fetchLimit = (limit || 50) + 1;
    const paginatedEvents = filteredEvents.slice(0, fetchLimit);
    const hasMore = paginatedEvents.length > (limit || 50);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventResults: any[] = paginatedEvents.slice(0, limit).map(event => ({
      id: event.SK.replace('EVENT#', ''),
      entityId: event.entityId,
      entityType: 'job',
      eventType: event.eventType as any,
      title: event.title,
      description: event.description,
      metadata: event.metadata,
      createdAt: event.createdAt,
      createdBy: event.createdBy,
      timestamp: event.SK.replace('EVENT#', ''),
      tenantId: event.tenantId,
    }));

    let nextCursor: PaginationCursor | undefined;
    if (hasMore && eventResults.length > 0) {
      const lastEvent = eventResults[eventResults.length - 1];
      nextCursor = {
        timestamp: lastEvent.timestamp,
        eventId: lastEvent.id,
      };
    }

    return {
      events: eventResults,
      hasMore,
      nextCursor,
      totalCount: filteredEvents.length,
    };
  } catch (error) {
    console.error('[JOB_EVENTS] Failed to get events:', error);
    return {
      events: [],
      hasMore: false,
    };
  }
}

/* ... (the rest of the helper functions remain unchanged) */

export async function recordJobCreated(
  jobId: string,
  jobTitle: string,
  companyName: string,
  createdBy: string
): Promise<RecordEventResponse> {
  return recordJobEvent(
    jobId,
    'JOB_CREATED',
    {
      title: 'Job Created',
      description: `${jobTitle} at ${companyName}`,
      metadata: {
        jobTitle,
        companyName,
      },
    },
    createdBy
  );
}

export async function recordJobUpdated(
  jobId: string,
  jobTitle: string,
  changes: Record<string, any>,
  createdBy: string
): Promise<RecordEventResponse> {
  const changeDescriptions = Object.keys(changes).join(', ');
  return recordJobEvent(
    jobId,
    'JOB_UPDATED',
    {
      title: 'Job Updated',
      description: `Changed: ${changeDescriptions}`,
      metadata: {
        jobTitle,
        changes,
      },
    },
    createdBy
  );
}

export async function recordJobStatusChanged(
  jobId: string,
  jobTitle: string,
  oldStatus: string,
  newStatus: string,
  createdBy: string
): Promise<RecordEventResponse> {
  return recordJobEvent(
    jobId,
    'JOB_STATUS_CHANGED',
    {
      title: 'Job Status Changed',
      description: `${oldStatus} → ${newStatus}`,
      metadata: {
        jobTitle,
        oldStatus,
        newStatus,
      },
    },
    createdBy
  );
}

export async function recordCandidateLinked(
  jobId: string,
  jobTitle: string,
  candidateId: string,
  candidateName: string,
  stage: string,
  createdBy: string
): Promise<RecordEventResponse> {
  return recordJobEvent(
    jobId,
    'CANDIDATE_LINKED',
    {
      title: 'Candidate Linked',
      description: `${candidateName} → ${stage}`,
      metadata: {
        jobTitle,
        candidateId,
        candidateName,
        stage,
      },
    },
    createdBy
  );
}

export async function recordCandidateUnlinked(
  jobId: string,
  jobTitle: string,
  candidateId: string,
  candidateName: string,
  createdBy: string
): Promise<RecordEventResponse> {
  return recordJobEvent(
    jobId,
    'CANDIDATE_UNLINKED',
    {
      title: 'Candidate Unlinked',
      description: `${candidateName} removed from job`,
      metadata: {
        jobTitle,
        candidateId,
        candidateName,
      },
    },
    createdBy
  );
}

export async function recordCandidateStageChanged(
  jobId: string,
  jobTitle: string,
  candidateId: string,
  candidateName: string,
  oldStage: string,
  newStage: string,
  createdBy: string
): Promise<RecordEventResponse> {
  return recordJobEvent(
    jobId,
    'CANDIDATE_STAGE_CHANGED',
    {
      title: 'Candidate Stage Changed',
      description: `${candidateName}: ${oldStage} → ${newStage}`,
      metadata: {
        jobTitle,
        candidateId,
        candidateName,
        oldStage,
        newStage,
      },
    },
    createdBy
  );
}

export async function addNoteToJob(
  jobId: string,
  noteText: string,
  createdBy: string
): Promise<RecordEventResponse> {
  if (!noteText || noteText.trim() === '') {
    return {
      success: false,
      error: 'Note text is required',
    };
  }

  return recordJobEvent(
    jobId,
    'NOTE',
    {
      title: 'Note Added',
      description: noteText.substring(0, 100) + (noteText.length > 100 ? '...' : ''),
      metadata: {
        noteText,
        changedBy: createdBy,
      },
    },
    createdBy
  );
}
