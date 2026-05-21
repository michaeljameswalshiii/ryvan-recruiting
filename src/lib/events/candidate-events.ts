/**
 * Candidate Events Service
 * Records and retrieves candidate events (emails, notes, status changes) from DynamoDB
 * 
 * @serverOnly
 */

'use server';

import { putItem, queryItems, eventsTable } from '../db/dynamodb';
import type {
  EventType,
  EventDetails,
  CandidateEvent,
  CandidateEventResult,
  GetEventsResponse,
  RecordEventResponse,
} from './types';

/**
 * Record an event for a candidate
 * 
 * @param candidateId - The candidate ID
 * @param eventType - Type of event (EMAIL_SENT, NOTE, etc.)
 * @param details - Event details (title, description, metadata)
 * @param createdBy - User email or ID who created the event
 * @returns Result with success status and event ID
 */
export async function recordEvent(
  candidateId: string,
  eventType: EventType,
  details: EventDetails,
  createdBy: string
): Promise<RecordEventResponse> {
  try {
    const timestamp = new Date().toISOString();
    const eventId = `${candidateId}-${timestamp}`;

    const event: CandidateEvent = {
      PK: `CANDIDATE#${candidateId}`,
      SK: `EVENT#${timestamp}`,
      candidateId,
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
 * Get all events for a candidate
 * 
 * @param candidateId - The candidate ID
 * @param limit - Optional limit for number of events to return
 * @returns List of events sorted by newest first
 */
export async function getCandidateEvents(
  candidateId: string,
  limit?: number
): Promise<GetEventsResponse> {
  try {
    const events = await queryItems<CandidateEvent>(
      eventsTable,
      'PK = :pk AND begins_with(SK, :skPrefix)',
      {
        ':pk': `CANDIDATE#${candidateId}`,
        ':skPrefix': 'EVENT#',
      }
    );

    // Sort by timestamp descending (newest first)
    const sortedEvents = events.sort((a, b) => 
      b.SK.localeCompare(a.SK)
    );

    // Apply limit if provided
    const limitedEvents = limit ? sortedEvents.slice(0, limit) : sortedEvents;

    // Convert to result format
    const eventResults: CandidateEventResult[] = limitedEvents.map(event => ({
      id: event.SK.replace('EVENT#', ''),
      candidateId: event.candidateId,
      eventType: event.eventType,
      title: event.title,
      description: event.description,
      metadata: event.metadata,
      createdAt: event.createdAt,
      createdBy: event.createdBy,
      timestamp: event.SK.replace('EVENT#', ''),
    }));

    return {
      events: eventResults,
      hasMore: limit ? events.length > limit : false,
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
 * @returns Result with success status
 */
export async function addNoteToCandidate(
  candidateId: string,
  noteText: string,
  createdBy: string
): Promise<RecordEventResponse> {
  if (!noteText || noteText.trim() === '') {
    return {
      success: false,
      error: 'Note text is required',
    };
  }

  return recordEvent(
    candidateId,
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
