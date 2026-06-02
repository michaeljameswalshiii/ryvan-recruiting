/**
 * Candidate Events Service
 * Records and retrieves candidate events (emails, notes, status changes) from DynamoDB
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
  CandidateEventType,
} from './types';

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
    candidateId?: string;
    eventType?: string;
    error?: Error;
    [key: string]: unknown;
  }
): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    service: 'candidate-events',
    message,
    ...meta,
  };
  
  // Use console methods based on level
  switch (level) {
    case 'error':
      console.error(`[EVENTS] ${message}`, JSON.stringify(meta));
      break;
    case 'warn':
      console.warn(`[EVENTS] ${message}`, JSON.stringify(meta));
      break;
    case 'debug':
      console.debug(`[EVENTS] ${message}`, JSON.stringify(meta));
      break;
    default:
      console.log(`[EVENTS] ${message}`, JSON.stringify(meta));
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
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Operation failed after retries');
}

/**
 * Get session tenant ID for event recording
 * Used for tenant isolation in event storage
 */
async function getEventTenantId(): Promise<string> {
  // Try to get tenant from session, fallback to extracting from user
  const { getSessionTenantId, getSessionUserId } = await import('../server-auth');
  const tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  
  // If no tenant ID but user is logged in, use default tenant
  if (!tenantId && userId) {
    return `tenant-${userId}`;
  }
  
  return tenantId || 'default-tenant';
}

/**
 * Record an event for a candidate
 * Includes tenant isolation via GSI1PK for tenant-wide queries
 * 
 * @param candidateId - The candidate ID
 * @param eventType - Type of event (EMAIL_SENT, NOTE, etc.)
 * @param details - Event details (title, description, metadata)
 * @param createdBy - User email or ID who created the event
 * @returns Result with success status and event ID
 */
export async function recordEvent(
  candidateId: string,
  eventType: CandidateEventType,
  details: EventDetails,
  createdBy: string
): Promise<RecordEventResponse> {
  try {
    const timestamp = new Date().toISOString();
    const eventId = `${candidateId}-${timestamp}`;
    
    // Get tenant ID for isolation
    const tenantId = await getEventTenantId();

    const event: CandidateEvent = {
      PK: `ENTITY#candidate#${candidateId}`,
      SK: `EVENT#${timestamp}`,
      GSI1PK: `TENANT#${tenantId}`,
      GSI1SK: `EVENT#${timestamp}`,
      tenantId,
      entityId: candidateId,
      entityType: 'candidate',
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
    console.error('[EVENTS] Failed to record event:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record event',
    };
  }
}

/**
 * Get all events for a candidate with optional filtering and pagination
 * 
 * @param candidateId - The candidate ID
 * @param options - Optional filtering and pagination options
 * @returns List of events sorted by newest first
 */
export async function getCandidateEvents(
  candidateId: string,
  options?: {
    limit?: number;
    cursor?: PaginationCursor;
    eventTypes?: CandidateEventType[];
    startDate?: string;
    endDate?: string;
  }
): Promise<GetEventsResponse> {
  try {
    const { limit, cursor, eventTypes, startDate, endDate } = options || {};
    
// Build query expression
    let queryExpr = 'PK = :pk AND begins_with(SK, :skPrefix)';
    const exprValues: Record<string, string> = {
      ':pk': `ENTITY#candidate#${candidateId}`,
      ':skPrefix': 'EVENT#',
    };

    // Apply cursor pagination if provided
    if (cursor) {
      queryExpr += ' AND SK < :cursorSK';
      exprValues[':cursorSK'] = cursor.timestamp;
    }

    const events = await queryItems<CandidateEvent>(
      eventsTable,
      queryExpr,
      exprValues
    );

    // Sort by timestamp descending (newest first)
    const sortedEvents = events.sort((a, b) => 
      b.SK.localeCompare(a.SK)
    );

    // Filter by event types if provided
    let filteredEvents = sortedEvents;
    if (eventTypes && eventTypes.length > 0) {
      filteredEvents = sortedEvents.filter(event => 
        eventTypes.includes(event.eventType as CandidateEventType)
      );
    }

    // Filter by date range if provided
    if (startDate || endDate) {
      filteredEvents = filteredEvents.filter(event => {
        const eventDate = event.createdAt;
        if (startDate && eventDate < startDate) return false;
        if (endDate && eventDate > endDate) return false;
        return true;
      });
    }

    // Apply limit if provided (fetch extra to check hasMore)
    const fetchLimit = (limit || 50) + 1;
    const paginatedEvents = filteredEvents.slice(0, fetchLimit);
    const hasMore = paginatedEvents.length > (limit || 50);

// Convert to result format
    const eventResults: CandidateEventResult[] = paginatedEvents.slice(0, limit).map(event => ({
      id: event.SK.replace('EVENT#', ''),
      entityId: event.entityId,
      entityType: 'candidate',
      eventType: event.eventType as CandidateEventType,
      title: event.title,
      description: event.description,
      metadata: event.metadata,
      createdAt: event.createdAt,
      createdBy: event.createdBy,
      timestamp: event.SK.replace('EVENT#', ''),
    }));

    // Build next cursor if there are more results
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
    console.error('[EVENTS] Failed to get events:', error);
    return {
      events: [],
      hasMore: false,
    };
  }
}

/**
 * Add a note to a candidate
 * 
 * @param candidateId - The candidate ID
 * @param noteText - The note text
 * @param createdBy - User email or ID who added the note
 * @param options - Optional additional metadata (e.g., stage for context)
 * @returns Result with success status
 */
export async function addNoteToCandidate(
  candidateId: string,
  noteText: string,
  createdBy: string,
  options?: {
    stage?: string | null;
    [key: string]: unknown;
  }
): Promise<RecordEventResponse> {
  if (!noteText || noteText.trim() === '') {
    return {
      success: false,
      error: 'Note text is required',
    };
  }

// Build metadata, including optional stage if provided
  const metadata: Record<string, unknown> = {
    noteText,
    changedBy: createdBy,
  };
  
  if (options?.stage) {
    metadata.stage = options.stage;
  }

  return recordEvent(
    candidateId,
    'NOTE',
    {
      title: 'Note Added',
      description: noteText.substring(0, 100) + (noteText.length > 100 ? '...' : ''),
      metadata,
    },
    createdBy
  );
}

/**
 * Record an email sent event
 * Internal function called by email service
 * 
 * @param candidateId - The candidate ID
 * @param emailSubject - Subject of the email
 * @param emailTo - Recipient email address
 * @param createdBy - User who sent the email
 * @param metadata - Additional metadata (messageId, etc.)
 * @returns Result with success status
 */
export async function recordEmailSent(
  candidateId: string,
  emailSubject: string,
  emailTo: string,
  createdBy: string,
  metadata?: Record<string, any>
): Promise<RecordEventResponse> {
  return recordEvent(
    candidateId,
    'EMAIL_SENT',
    {
      title: 'Email Sent',
      description: `Subject: ${emailSubject}`,
      metadata: {
        emailSubject,
        emailTo,
        changedBy: createdBy,
        ...metadata,
      },
    },
    createdBy
  );
}

/**
 * Record a status change event
 * 
 * @param candidateId - The candidate ID
 * @param oldStatus - Previous status
 * @param newStatus - New status
 * @param createdBy - User who changed the status
 * @returns Result with success status
 */
export async function recordStatusChange(
  candidateId: string,
  oldStatus: string,
  newStatus: string,
  createdBy: string
): Promise<RecordEventResponse> {
  return recordEvent(
    candidateId,
    'STATUS_CHANGE',
    {
      title: 'Status Changed',
      description: `${oldStatus || 'None'} → ${newStatus}`,
      metadata: {
        oldStatus,
        newStatus,
        changedBy: createdBy,
      },
    },
    createdBy
  );
}

/**
 * Record an interview scheduled event
 * 
 * @param candidateId - The candidate ID
 * @param interviewDate - Date of the interview
 * @param interviewType - Type of interview
 * @param createdBy - User who scheduled the interview
 * @returns Result with success status
 */
export async function recordInterviewScheduled(
  candidateId: string,
  interviewDate: string,
  interviewType: string,
  createdBy: string
): Promise<RecordEventResponse> {
  return recordEvent(
    candidateId,
    'INTERVIEW_SCHEDULED',
    {
      title: 'Interview Scheduled',
      description: `${interviewType} on ${new Date(interviewDate).toLocaleDateString()}`,
      metadata: {
        interviewDate,
        interviewType,
        changedBy: createdBy,
      },
    },
    createdBy
  );
}

/**
 * Record a candidate imported from AI/Apollo
 * 
 * @param candidateId - The candidate ID
 * @param source - Source of import (apollo, ai_search, manual)
 * @param confidence - AI confidence score (0-1)
 * @param rawData - Original raw data from AI
 * @param searchQuery - Original search query used
 * @param importedBy - User who imported
 * @returns Result with success status
 */
export async function recordCandidateImported(
  candidateId: string,
  source: string,
  importedBy: string,
  confidence?: number,
  rawData?: any,
  searchQuery?: string
): Promise<RecordEventResponse> {
  const confidencePercent = confidence ? Math.round(confidence * 100) : null;
  const description = confidencePercent 
    ? `Imported from ${source} (${confidencePercent}% confidence)`
    : `Imported from ${source}`;

return recordEvent(
    candidateId,
    'CANDIDATE_IMPORTED',
    {
      title: 'Candidate Imported',
      description,
      metadata: {
        source,
        confidence,
        rawData,
        searchQuery,
        importedBy,
      },
    },
    importedBy
  );
}

/**
 * Record a stage change event
 * 
 * @param candidateId - The candidate ID
 * @param oldStage - Previous stage
 * @param newStage - New stage
 * @param createdBy - User who changed the stage
 * @param pipelineId - Optional pipeline ID
 * @returns Result with success status
 */
export async function recordStageChange(
  candidateId: string,
  oldStage: string,
  newStage: string,
  createdBy: string,
  pipelineId?: string
): Promise<RecordEventResponse> {
  return recordEvent(
    candidateId,
    'STAGE_CHANGE',
    {
      title: 'Stage Changed',
      description: `${oldStage || 'None'} → ${newStage}`,
      metadata: {
        oldStage,
        newStage,
        pipelineId,
        changedBy: createdBy,
      },
    },
    createdBy
  );
}

/**
 * Record a task created event
 * 
 * @param candidateId - The candidate ID
 * @param taskId - The task ID
 * @param taskTitle - The task title
 * @param createdBy - User who created the task
 * @param dueDate - Optional due date
 * @param assignedTo - Optional assignee
 * @returns Result with success status
 */
export async function recordTaskCreated(
  candidateId: string,
  taskId: string,
  taskTitle: string,
  createdBy: string,
  dueDate?: string,
  assignedTo?: string
): Promise<RecordEventResponse> {
  return recordEvent(
    candidateId,
    'TASK_CREATED',
    {
      title: 'Task Created',
      description: taskTitle,
      metadata: {
        taskId,
        taskTitle,
        dueDate,
        assignedTo,
        createdBy,
      },
    },
    createdBy
  );
}

/**
 * Record a task completed event
 * 
 * @param candidateId - The candidate ID
 * @param taskId - The task ID
 * @param taskTitle - The task title
 * @param completedBy - User who completed the task
 * @param outcome - Optional outcome/completion notes
 * @returns Result with success status
 */
export async function recordTaskCompleted(
  candidateId: string,
  taskId: string,
  taskTitle: string,
  completedBy: string,
  outcome?: string
): Promise<RecordEventResponse> {
  return recordEvent(
    candidateId,
    'TASK_COMPLETED',
    {
      title: 'Task Completed',
      description: taskTitle,
      metadata: {
        taskId,
        taskTitle,
        outcome,
        completedBy,
      },
    },
    completedBy
  );
}

/**
 * Record a candidate viewed event
 * 
 * @param candidateId - The candidate ID
 * @param viewerId - The viewer ID
 * @param createdBy - User who viewed (or system)
 * @param options - Optional parameters (viewerEmail, source)
 * @returns Result with success status
 */
export async function recordCandidateViewed(
  candidateId: string,
  viewerId: string,
  createdBy: string,
  options?: {
    viewerEmail?: string;
    source?: string;
  }
): Promise<RecordEventResponse> {
  const { viewerEmail, source } = options || {};
  const sourceDescription = source ? ` via ${source}` : '';
  return recordEvent(
    candidateId,
    'CANDIDATE_VIEWED',
    {
      title: 'Candidate Viewed',
      description: `Viewed by ${viewerEmail || viewerId}${sourceDescription}`,
      metadata: {
        viewerId,
        viewerEmail,
        source,
        viewedAt: new Date().toISOString(),
      },
    },
    createdBy
  );
}

/**
 * Record a candidate assigned event
 * 
 * @param candidateId - The candidate ID
 * @param assignedTo - User being assigned to
 * @param createdBy - User who performed the assignment
 * @param options - Optional parameters (previousOwner)
 * @returns Result with success status
 */
export async function recordCandidateAssigned(
  candidateId: string,
  assignedTo: string,
  createdBy: string,
  options?: {
    previousOwner?: string;
  }
): Promise<RecordEventResponse> {
  const { previousOwner } = options || {};
  const description = previousOwner 
    ? `Reassigned from ${previousOwner} to ${assignedTo}`
    : `Assigned to ${assignedTo}`;
  
  return recordEvent(
    candidateId,
    'CANDIDATE_ASSIGNED',
    {
      title: 'Candidate Assigned',
      description,
      metadata: {
        assignedTo,
        previousOwner,
        assignedAt: new Date().toISOString(),
      },
    },
    createdBy
  );
}

/**
 * Record a call completed event
 * 
 * @param candidateId - The candidate ID
 * @param callDate - Date of the call
 * @param createdBy - User who completed the call
 * @param options - Optional parameters (callType, duration, outcome, notes)
 * @returns Result with success status
 */
export async function recordCallCompleted(
  candidateId: string,
  callDate: string,
  createdBy: string,
  options?: {
    callType?: string;
    duration?: number;
    outcome?: string;
    notes?: string;
  }
): Promise<RecordEventResponse> {
  const { callType, duration, outcome, notes } = options || {};
  const durationStr = duration ? `${Math.floor(duration / 60)} min` : 'N/A';
  const description = `${callType || 'Call'} - ${outcome || 'Completed'} (${durationStr})`;
  
  return recordEvent(
    candidateId,
    'CALL_COMPLETED',
    {
      title: 'Call Completed',
      description,
      metadata: {
        callDate,
        callType,
        duration,
        outcome,
        notes,
        changedBy: createdBy,
      },
    },
    createdBy
  );
}

/**
 * Record an email opened event
 * 
 * @param candidateId - The candidate ID
 * @param emailSubject - Subject of the email
 * @param emailTo - Recipient email address
 * @param createdBy - User or system who recorded
 * @param options - Optional parameters (messageId)
 * @returns Result with success status
 */
export async function recordEmailOpened(
  candidateId: string,
  emailSubject: string,
  emailTo: string,
  createdBy: string,
  options?: {
    messageId?: string;
  }
): Promise<RecordEventResponse> {
  const { messageId } = options || {};
  return recordEvent(
    candidateId,
    'EMAIL_OPENED',
    {
      title: 'Email Opened',
      description: `Subject: ${emailSubject}`,
      metadata: {
        emailSubject,
        emailTo,
        messageId,
        openedAt: new Date().toISOString(),
      },
    },
    createdBy
  );
}

/**
 * Record an email clicked event
 * 
 * @param candidateId - The candidate ID
 * @param emailSubject - Subject of the email
 * @param emailTo - Recipient email address
 * @param createdBy - User or system who recorded
 * @param options - Optional parameters (messageId, urlClicked)
 * @returns Result with success status
 */
export async function recordEmailClicked(
  candidateId: string,
  emailSubject: string,
  emailTo: string,
  createdBy: string,
  options?: {
    messageId?: string;
    urlClicked?: string;
  }
): Promise<RecordEventResponse> {
  const { messageId, urlClicked } = options || {};
  return recordEvent(
    candidateId,
    'EMAIL_CLICKED',
    {
      title: 'Email Link Clicked',
      description: `Subject: ${emailSubject}`,
      metadata: {
        emailSubject,
        emailTo,
        messageId,
        urlClicked,
        clickedAt: new Date().toISOString(),
      },
    },
    createdBy
  );
}

/**
 * Record a pipeline move event
 * 
 * @param candidateId - The candidate ID
 * @param fromStage - Previous stage
 * @param toStage - New stage
 * @param pipelineId - Pipeline ID
 * @param createdBy - User who moved
 * @param options - Optional parameters (reason)
 * @returns Result with success status
 */
export async function recordPipelineMove(
  candidateId: string,
  fromStage: string,
  toStage: string,
  pipelineId: string,
  createdBy: string,
  options?: {
    reason?: string;
  }
): Promise<RecordEventResponse> {
  const { reason } = options || {};
  return recordEvent(
    candidateId,
    'PIPELINE_MOVE',
    {
      title: 'Pipeline Stage Moved',
      description: `${fromStage} → ${toStage}`,
      metadata: {
        fromStage,
        toStage,
        pipelineId,
        reason,
        movedBy: createdBy,
      },
    },
    createdBy
  );
}
