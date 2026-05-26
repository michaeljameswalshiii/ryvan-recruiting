/**
 * Company Events Service
 * Records and retrieves company events (notes, status changes) from DynamoDB
 * 
 * @serverOnly
 */

'use server';

import { putItem, queryItems, eventsTable } from '../db/dynamodb';
import type {
  CompanyEventType,
  EventDetails,
  CompanyEvent,
  CompanyEventResult,
  GetCompanyEventsResponse,
  RecordCompanyEventResponse,
} from './types';

/**
 * Record an event for a company
 * 
 * @param companyId - The company ID
 * @param eventType - Type of event (NOTE, STATUS_CHANGE, etc.)
 * @param details - Event details (title, description, metadata)
 * @param createdBy - User email or ID who created the event
 * @returns Result with success status and event ID
 */
export async function recordCompanyEvent(
  companyId: string,
  eventType: CompanyEventType,
  details: EventDetails,
  createdBy: string
): Promise<RecordCompanyEventResponse> {
  try {
    const timestamp = new Date().toISOString();
    const eventId = `${companyId}-${timestamp}`;

    const event: CompanyEvent = {
      PK: `COMPANY#${companyId}`,
      SK: `EVENT#${timestamp}`,
      companyId,
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
    console.error('[COMPANY_EVENTS] Failed to record event:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record event',
    };
  }
}

/**
 * Get all events for a company
 * 
 * @param companyId - The company ID
 * @param limit - Optional limit for number of events to return
 * @returns List of events sorted by newest first
 */
export async function getCompanyEvents(
  companyId: string,
  limit?: number
): Promise<GetCompanyEventsResponse> {
  try {
    const events = await queryItems<CompanyEvent>(
      eventsTable,
      'PK = :pk AND begins_with(SK, :skPrefix)',
      {
        ':pk': `COMPANY#${companyId}`,
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
    const eventResults: CompanyEventResult[] = limitedEvents.map(event => ({
      id: event.SK.replace('EVENT#', ''),
      companyId: event.companyId,
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
    console.error('[COMPANY_EVENTS] Failed to get events:', error);
    return {
      events: [],
      hasMore: false,
    };
  }
}

/**
 * Add a note to a company
 * 
 * @param companyId - The company ID
 * @param noteText - The note text
 * @param createdBy - User email or ID who added the note
 * @returns Result with success status
 */
export async function addNoteToCompany(
  companyId: string,
  noteText: string,
  createdBy: string
): Promise<RecordCompanyEventResponse> {
  if (!noteText || noteText.trim() === '') {
    return {
      success: false,
      error: 'Note text is required',
    };
  }

  return recordCompanyEvent(
    companyId,
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
 * Record a status change event
 * 
 * @param companyId - The company ID
 * @param oldStatus - Previous status
 * @param newStatus - New status
 * @param createdBy - User who changed the status
 * @returns Result with success status
 */
export async function recordCompanyStatusChange(
  companyId: string,
  oldStatus: string,
  newStatus: string,
  createdBy: string
): Promise<RecordCompanyEventResponse> {
  return recordCompanyEvent(
    companyId,
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
 * Record a company added event
 * 
 * @param companyId - The company ID
 * @param companyName - Name of the company
 * @param addedBy - User who added the company
 * @returns Result with success status
 */
export async function recordCompanyAdded(
  companyId: string,
  companyName: string,
  addedBy: string
): Promise<RecordCompanyEventResponse> {
  return recordCompanyEvent(
    companyId,
    'COMPANY_ADDED',
    {
      title: 'Company Added',
      description: `${companyName} was added to the pipeline`,
      metadata: {
        companyName,
        addedBy,
      },
    },
    addedBy
  );
}

/**
 * Record a contact added event
 * 
 * @param companyId - The company ID
 * @param contactName - Name of the contact
 * @param addedBy - User who added the contact
 * @returns Result with success status
 */
export async function recordContactAdded(
  companyId: string,
  contactName: string,
  addedBy: string
): Promise<RecordCompanyEventResponse> {
  return recordCompanyEvent(
    companyId,
    'CONTACT_ADDED',
    {
      title: 'Contact Added',
      description: `${contactName} was added as a contact`,
      metadata: {
        contactName,
        addedBy,
      },
    },
    addedBy
  );
}
