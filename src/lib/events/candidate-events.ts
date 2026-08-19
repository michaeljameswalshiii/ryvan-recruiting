/**
 * Candidate Events Service
 * Records and retrieves candidate events (emails, notes, status changes) from DynamoDB
 * 
 * @serverOnly
 */

'use server';

import {
  putItem,
  queryItems,
  getItem,
  updateItem,
  deleteItem,
  eventsTable,
} from '../db/dynamodb';
import type {
  EventDetails,
  CandidateEvent,
  CandidateEventResult,
  GetEventsResponse,
  RecordEventResponse,
  PaginationCursor,
  CandidateEventType,
} from './types';
import {
  ACTIVITY_NOTE_TYPES,
  normalizeNoteTypeLabel,
} from '@/lib/candidates/note-type-stage';

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
  createdBy: string,
  /** Prefer explicit tenant (e.g. MCP API key) over session */
  options?: { tenantId?: string | null }
): Promise<RecordEventResponse> {
  try {
    const timestamp = new Date().toISOString();
    const eventId = `${candidateId}-${timestamp}`;
    
    // Get tenant ID for isolation
    const tenantId =
      (options?.tenantId && String(options.tenantId).trim()) ||
      (await getEventTenantId());

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

    if (eventType === 'NOTE') {
      const noteText = String(
        details.description ||
          (details.metadata as { noteText?: string } | undefined)?.noteText ||
          ''
      ).trim();
      if (noteText) {
        try {
          const { setLeadLastNote } = await import(
            '../db/repositories/lead-repository'
          );
          await setLeadLastNote(tenantId, candidateId, noteText, timestamp);
        } catch (err) {
          console.warn('[EVENTS] last_note denormalize failed', err);
        }
      }
    }

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
 * Latest NOTE text per candidate for list columns.
 * Uses tenant GSI; returns {} if the index is unavailable.
 */
export async function getLatestNotesByCandidate(
  tenantId: string,
  limit = 400
): Promise<Record<string, string>> {
  if (!tenantId) return {};
  try {
    const raw = await queryItems<CandidateEvent>(
      eventsTable,
      'GSI1PK = :pk AND begins_with(GSI1SK, :prefix)',
      { ':pk': `TENANT#${tenantId}`, ':prefix': 'EVENT#' },
      {
        IndexName: 'GSI1',
        ScanIndexForward: false,
        limit,
      }
    );
    const events = Array.isArray(raw) ? raw : raw?.items || [];
    const out: Record<string, string> = {};
    for (const ev of events) {
      const id = String(ev.entityId || '').trim();
      if (!id || out[id]) continue;
      if (String(ev.eventType || '').toUpperCase() !== 'NOTE') continue;
      const text = String(
        (ev.metadata as { noteText?: string } | undefined)?.noteText ||
          ev.description ||
          ''
      )
        .replace(/\s+/g, ' ')
        .trim();
      if (text) out[id] = text;
    }
    return out;
  } catch (error) {
    console.warn('[EVENTS] getLatestNotesByCandidate', error);
    return {};
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

    // queryItems returns { items: T[], lastEvaluatedKey?: ... } — not a bare array
    const rawResponse = await queryItems<CandidateEvent>(
      eventsTable,
      queryExpr,
      exprValues
    );
    const events = Array.isArray(rawResponse)
      ? rawResponse
      : (rawResponse?.items || []);

    // Sort by timestamp descending (newest first)
    const sortedEvents = [...events].sort((a, b) =>
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
      tenantId: event.tenantId,
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
 * Resolve DynamoDB SK for a candidate event.
 * Client-facing ids are the ISO timestamp portion of SK (`EVENT#timestamp`).
 */
function resolveEventSK(eventId: string): string {
  if (!eventId) throw new Error('Event ID is required');
  if (eventId.startsWith('EVENT#')) return eventId;
  return `EVENT#${eventId}`;
}

/**
 * Update an existing candidate activity/note event.
 * Edits note text, note type labels, title, and description in place.
 */
export async function updateCandidateEvent(
  candidateId: string,
  eventId: string,
  updates: {
    noteText?: string;
    noteType?: string;
    title?: string;
    description?: string;
  }
): Promise<RecordEventResponse & { event?: CandidateEventResult }> {
  try {
    if (!candidateId || !eventId) {
      return { success: false, error: 'Candidate ID and event ID are required' };
    }

    const sk = resolveEventSK(eventId);
    const pk = `ENTITY#candidate#${candidateId}`;

    const existing = await getItem<CandidateEvent>(eventsTable, {
      PK: pk,
      SK: sk,
    });
    if (!existing) {
      return { success: false, error: 'Event not found' };
    }

    const meta = { ...(existing.metadata || {}) };
    let title = existing.title;
    let description = existing.description;

    if (updates.noteText !== undefined) {
      const text = updates.noteText.trim();
      if (!text) {
        return { success: false, error: 'Note text is required' };
      }
      meta.noteText = text;
      description = text;
    }

    if (updates.noteType !== undefined) {
      const noteTypeValue = updates.noteType;
      const noteTypeLabel = normalizeNoteTypeLabel(
        candidateNoteTypes.find((t) => t.value === noteTypeValue)?.label ||
          noteTypeValue
      );
      meta.noteType = noteTypeValue;
      meta.noteTypeLabel = noteTypeLabel;
      if (existing.eventType === 'NOTE' || meta.noteText) {
        title = `Note - ${noteTypeLabel}`;
      }
    }

    if (updates.title !== undefined) title = updates.title;
    if (updates.description !== undefined) description = updates.description;

    meta.updatedAt = new Date().toISOString();

    await updateItem(
      eventsTable,
      { PK: pk, SK: sk },
      'SET #title = :title, #description = :description, #metadata = :metadata',
      {
        ':title': title,
        ':description': description,
        ':metadata': meta,
      },
      {
        '#title': 'title',
        '#description': 'description',
        '#metadata': 'metadata',
      }
    );

    const resolvedId = sk.replace('EVENT#', '');
    const latestText = String(
      (meta as { noteText?: string }).noteText || description || ''
    ).trim();
    if (latestText && existing.tenantId) {
      try {
        const { setLeadLastNote } = await import(
          '../db/repositories/lead-repository'
        );
        await setLeadLastNote(
          existing.tenantId,
          candidateId,
          latestText,
          new Date().toISOString()
        );
      } catch (err) {
        console.warn('[EVENTS] last_note denormalize on edit failed', err);
      }
    }
    return {
      success: true,
      eventId: resolvedId,
      event: {
        id: resolvedId,
        entityId: candidateId,
        entityType: 'candidate',
        tenantId: existing.tenantId,
        eventType: existing.eventType as CandidateEventType,
        title,
        description,
        metadata: meta,
        createdAt: existing.createdAt,
        createdBy: existing.createdBy,
        timestamp: resolvedId,
      },
    };
  } catch (error) {
    console.error('[EVENTS] Failed to update event:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update event',
    };
  }
}

/**
 * Permanently delete a candidate activity/note event.
 */
export async function deleteCandidateEvent(
  candidateId: string,
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!candidateId || !eventId) {
      return { success: false, error: 'Candidate ID and event ID are required' };
    }

    const sk = resolveEventSK(eventId);
    const pk = `ENTITY#candidate#${candidateId}`;

    const existing = await getItem<CandidateEvent>(eventsTable, {
      PK: pk,
      SK: sk,
    });
    if (!existing) {
      return { success: false, error: 'Event not found' };
    }

    await deleteItem(eventsTable, { PK: pk, SK: sk });
    return { success: true };
  } catch (error) {
    console.error('[EVENTS] Failed to delete event:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete event',
    };
  }
}

// Canonical note types + legacy aliases for display labels
const candidateNoteTypes = [
  ...ACTIVITY_NOTE_TYPES.map((t) => ({ value: t.value, label: t.label })),
  // Legacy stored values still resolve via normalizeNoteTypeLabel
  { value: 'general', label: 'Other' },
  { value: 'phone_call', label: 'Other' },
  { value: 'email_sent', label: 'EM Sent' },
  { value: 'Email Sent', label: 'EM Sent' },
  { value: 'Email Received', label: 'EM Received' },
  { value: 'Left Message', label: 'LM' },
  { value: 'Interview Scheduled', label: 'Interview' },
  { value: 'meeting', label: 'Other' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'stage_change', label: 'Other' },
  { value: 'job_linked', label: 'Attached' },
  { value: 'Attached', label: 'Attached' },
  { value: 'job_unlinked', label: 'Other' },
  { value: 'job_stage_change', label: 'Other' },
  { value: 'profile_updated', label: 'Other' },
];

/**
 * Add a note to a candidate
 * 
 * @param candidateId - The candidate ID
 * @param noteText - The note text
 * @param createdBy - User email or ID who added the note
 * @param options - Optional additional metadata (e.g., stage, noteType for context)
 * @returns Result with success status
 */
export async function addNoteToCandidate(
  candidateId: string,
  noteText: string,
  createdBy: string,
  options?: {
    stage?: string | null;
    noteType?: string;
    /** Stored job association (not a live join) */
    jobId?: string | null;
    jobTitle?: string | null;
    companyName?: string | null;
    /** Explicit tenant for MCP / non-session callers */
    tenantId?: string | null;
    [key: string]: unknown;
  }
): Promise<RecordEventResponse> {
  // Note detail text is optional — action type alone is enough (e.g. "No Answer")
  const text = (noteText || '').trim();
  const noteTypeValue = options?.noteType || 'Other';
  const noteTypeLabel = normalizeNoteTypeLabel(
    candidateNoteTypes.find((t) => t.value === noteTypeValue)?.label ||
      String(noteTypeValue).replace(/_/g, ' ') ||
      'Other'
  );

  // Build metadata, including optional stage and noteType if provided
  const metadata: Record<string, unknown> = {
    noteText: text,
    noteType: noteTypeValue,
    noteTypeLabel,
    changedBy: createdBy,
  };
  if (options?.actorUserId) {
    metadata.actorUserId = String(options.actorUserId);
  }
  if (options?.actorEmail) {
    metadata.actorEmail = String(options.actorEmail);
  }
  
  if (options?.stage) {
    metadata.stage = options.stage;
  }
  if (options?.previousStage) {
    metadata.previousStage = String(options.previousStage);
  }
  if (options?.newStage) {
    metadata.newStage = String(options.newStage);
  }
  if (typeof options?.stageUpdated === 'boolean') {
    metadata.stageUpdated = options.stageUpdated;
  }
  if (typeof options?.autoStageSync === 'boolean') {
    metadata.autoStageSync = options.autoStageSync;
  }

  // Job tag — stored permanently so closed/unlinked jobs still render
  const jobId = options?.jobId ? String(options.jobId).trim() : '';
  if (jobId) {
    metadata.jobId = jobId;
    if (options?.jobTitle) metadata.jobTitle = String(options.jobTitle);
    if (options?.companyName) metadata.companyName = String(options.companyName);
  }

  // Prefer free-text when present; otherwise show the action type as the description
  const description = text || noteTypeLabel;

  const jobSuffix =
    jobId && options?.jobTitle
      ? ` · ${options.jobTitle}`
      : '';

  return recordEvent(
    candidateId,
    'NOTE',
    {
      title: `Note - ${noteTypeLabel}${jobSuffix}`,
      description,
      metadata,
    },
    createdBy,
    { tenantId: options?.tenantId }
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

/** Candidate linked to a job (application) */
export async function recordJobLinked(
  candidateId: string,
  jobId: string,
  jobTitle: string,
  createdBy: string,
  options?: { companyName?: string; stage?: string }
): Promise<RecordEventResponse> {
  const stage = options?.stage || "sourced";
  const company = options?.companyName ? ` @ ${options.companyName}` : "";
  return recordEvent(
    candidateId,
    "JOB_LINKED",
    {
      title: "Attached to job",
      description: `Attached to ${jobTitle}${company} · stage: ${stage.replace(/_/g, " ")}`,
      metadata: {
        noteText: `Attached to job: ${jobTitle}${company}`,
        noteType: "Attached",
        noteTypeLabel: "Attached",
        systemKind: "job_linked",
        jobId,
        jobTitle,
        companyName: options?.companyName,
        stage,
        changedBy: createdBy,
      },
    },
    createdBy
  );
}

/** Candidate unlinked from a job */
export async function recordJobUnlinked(
  candidateId: string,
  jobId: string,
  jobTitle: string,
  createdBy: string
): Promise<RecordEventResponse> {
  return recordEvent(
    candidateId,
    "JOB_UNLINKED",
    {
      title: "Unlinked from job",
      description: `Unlinked from ${jobTitle || jobId}`,
      metadata: {
        noteText: `Unlinked from job: ${jobTitle || jobId}`,
        noteType: "Other",
        noteTypeLabel: "Other",
        systemKind: "job_unlinked",
        jobId,
        jobTitle,
        changedBy: createdBy,
      },
    },
    createdBy
  );
}

/** Stage change on a specific linked job */
export async function recordJobStageChanged(
  candidateId: string,
  jobId: string,
  jobTitle: string,
  oldStage: string,
  newStage: string,
  createdBy: string
): Promise<RecordEventResponse> {
  const from = (oldStage || "—").replace(/_/g, " ");
  const to = (newStage || "—").replace(/_/g, " ");
  return recordEvent(
    candidateId,
    "JOB_STAGE_CHANGED",
    {
      title: "Job stage changed",
      description: `${jobTitle}: ${from} → ${to}`,
      metadata: {
        noteText: `Job stage on "${jobTitle}": ${from} → ${to}`,
        noteType: "Other",
        noteTypeLabel: "Other",
        systemKind: "job_stage_change",
        jobId,
        jobTitle,
        oldStage,
        newStage,
        stage: newStage,
        changedBy: createdBy,
      },
    },
    createdBy
  );
}

/**
 * AI job-fit assessment completed (or re-run).
 * Action type: AI Review (systemKind ai_fit). Does not change pipeline stage.
 */
export async function recordAiFitAssessed(
  candidateId: string,
  jobId: string,
  jobTitle: string,
  createdBy: string,
  fit: {
    score: number;
    grade: string;
    summary?: string;
    strengths?: string[];
    gaps?: string[];
    reasons?: string[];
    domainFit?: { score: number; grade?: string };
    toolReadiness?: {
      score: number;
      grade?: string;
      applicable?: boolean;
    };
  }
): Promise<RecordEventResponse> {
  const summary =
    (fit.summary && fit.summary.trim()) ||
    `Fit score: ${fit.score}/100 (grade ${fit.grade})`;
  const splitLine = [
    fit.domainFit
      ? `Domain ${fit.domainFit.score}/100 (${fit.domainFit.grade || "?"})`
      : null,
    fit.toolReadiness?.applicable === false
      ? "Tools n/a"
      : fit.toolReadiness
        ? `Tools ${fit.toolReadiness.score}/100 (${fit.toolReadiness.grade || "?"})`
        : null,
    `Overall ${fit.score}/100 (${fit.grade})`,
  ]
    .filter(Boolean)
    .join(" · ");
  const noteText = [
    `AI fit for "${jobTitle}": ${splitLine}`,
    summary,
  ]
    .filter(Boolean)
    .join("\n");

  return recordEvent(
    candidateId,
    "NOTE",
    {
      title: `AI Review · ${jobTitle}`,
      description: splitLine || `Fit ${fit.score}/100 (${fit.grade}) for ${jobTitle}`,
      metadata: {
        noteText,
        noteType: "AI Review",
        noteTypeLabel: "AI Review",
        systemKind: "ai_fit",
        jobId,
        jobTitle,
        fitScore: fit.score,
        fitGrade: fit.grade,
        fitDomainScore: fit.domainFit?.score,
        fitDomainGrade: fit.domainFit?.grade,
        fitToolScore: fit.toolReadiness?.score,
        fitToolGrade: fit.toolReadiness?.grade,
        fitToolApplicable: fit.toolReadiness?.applicable,
        fitSummary: summary,
        fitStrengths: fit.strengths?.slice(0, 6) || [],
        fitGaps: fit.gaps?.slice(0, 6) || [],
        fitReasons: fit.reasons?.slice(0, 6) || [],
        changedBy: createdBy,
      },
    },
    createdBy
  );
}

/** Profile / contact fields updated */
export async function recordProfileUpdated(
  candidateId: string,
  summary: string,
  createdBy: string,
  fields?: string[]
): Promise<RecordEventResponse> {
  return recordEvent(
    candidateId,
    "PROFILE_UPDATED",
    {
      title: "Profile updated",
      description: summary,
      metadata: {
        noteText: summary,
        noteType: "Other",
        noteTypeLabel: "Other",
        systemKind: "profile_updated",
        fields: fields || [],
        changedBy: createdBy,
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
