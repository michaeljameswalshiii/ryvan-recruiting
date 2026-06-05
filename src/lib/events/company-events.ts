/**
 * Company Events Service
 * Records and retrieves company events from DynamoDB
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
 * Core function - Record any company event
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

    return { success: true, eventId };
  } catch (error) {
    console.error('[COMPANY EVENTS] Failed to record event:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record company event',
    };
  }
}

/**
 * Get events for a company
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

    const sortedEvents = events.sort((a, b) => b.SK.localeCompare(a.SK));
    const limitedEvents = limit ? sortedEvents.slice(0, limit) : sortedEvents;

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
    console.error('[COMPANY EVENTS] Failed to get events:', error);
    return { events: [], hasMore: false };
  }
}

/* ==================== Helper Functions for All Company Events ==================== */

export async function addNoteToCompany(
  companyId: string,
  noteText: string,
  createdBy: string,
  noteType?: string
): Promise<RecordCompanyEventResponse> {
  if (!noteText?.trim()) return { success: false, error: 'Note text is required' };

  // Get the note type label for display
  const noteTypeLabel = noteType 
    ? noteTypes.find(t => t.value === noteType)?.label || 'General Note'
    : 'General Note';

  return recordCompanyEvent(
    companyId,
    'NOTE',
    { 
      title: `Note - ${noteTypeLabel}`, 
      description: noteText.substring(0, 150) + (noteText.length > 150 ? '...' : ''), 
      metadata: { noteText, noteType, noteTypeLabel, changedBy: createdBy } 
    },
    createdBy
  );
}

// Note types constants - used for display labels
const noteTypes = [
  { value: 'general', label: 'General Note' },
  { value: 'phone_call', label: 'Phone call' },
  { value: 'email_sent', label: 'Email sent' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'proposal_sent', label: 'Proposal sent' },
  { value: 'contract_signed', label: 'Contract signed' },
  { value: 'placement_made', label: 'Placement made' },
  { value: 'check_in', label: 'Check-in' },
  { value: 'other', label: 'Other' },
];

export async function recordEmailSentToCompany(
  companyId: string,
  emailSubject: string,
  emailTo: string,
  createdBy: string,
  metadata?: Record<string, any>
): Promise<RecordCompanyEventResponse> {
  return recordCompanyEvent(companyId, 'EMAIL_SENT', {
    title: 'Email Sent',
    description: `Subject: ${emailSubject}`,
    metadata: { emailSubject, emailTo, changedBy: createdBy, ...metadata }
  }, createdBy);
}

export async function recordEmailOpenedForCompany(
  companyId: string,
  emailSubject: string,
  createdBy: string
): Promise<RecordCompanyEventResponse> {
  return recordCompanyEvent(companyId, 'EMAIL_OPENED', {
    title: 'Email Opened',
    description: `Opened: ${emailSubject}`,
    metadata: { emailSubject, changedBy: createdBy }
  }, createdBy);
}

export async function recordEmailClickedForCompany(
  companyId: string,
  emailSubject: string,
  linkClicked: string,
  createdBy: string
): Promise<RecordCompanyEventResponse> {
  return recordCompanyEvent(companyId, 'EMAIL_CLICKED', {
    title: 'Email Link Clicked',
    description: `Clicked in: ${emailSubject}`,
    metadata: { emailSubject, linkClicked, changedBy: createdBy }
  }, createdBy);
}

export async function recordCompanyImported(
  companyId: string,
  source: string,
  createdBy: string
): Promise<RecordCompanyEventResponse> {
  return recordCompanyEvent(companyId, 'COMPANY_IMPORTED', {
    title: 'Company Imported',
    description: `Imported from ${source}`,
    metadata: { source, changedBy: createdBy }
  }, createdBy);
}

export async function recordCompanyCreated(
  companyId: string,
  companyName: string,
  createdBy: string
): Promise<RecordCompanyEventResponse> {
  return recordCompanyEvent(companyId, 'COMPANY_CREATED', {
    title: 'Company Created',
    description: `Company "${companyName}" was created`,
    metadata: { companyName, changedBy: createdBy }
  }, createdBy);
}

export async function recordCompanyViewed(
  companyId: string,
  viewerName: string,
  createdBy: string
): Promise<RecordCompanyEventResponse> {
  return recordCompanyEvent(companyId, 'COMPANY_VIEWED', {
    title: 'Company Viewed',
    description: `Viewed by ${viewerName}`,
    metadata: { viewerName, changedBy: createdBy }
  }, createdBy);
}

export async function recordContactAddedToCompany(
  companyId: string,
  contactName: string,
  createdBy: string
): Promise<RecordCompanyEventResponse> {
  return recordCompanyEvent(companyId, 'CONTACT_ADDED', {
    title: 'Contact Added',
    description: `Added contact: ${contactName}`,
    metadata: { contactName, changedBy: createdBy }
  }, createdBy);
}

export async function recordContactRemovedFromCompany(
  companyId: string,
  contactName: string,
  createdBy: string
): Promise<RecordCompanyEventResponse> {
  return recordCompanyEvent(companyId, 'CONTACT_REMOVED', {
    title: 'Contact Removed',
    description: `Removed contact: ${contactName}`,
    metadata: { contactName, changedBy: createdBy }
  }, createdBy);
}

export async function recordContactUpdatedForCompany(
  companyId: string,
  contactName: string,
  changes: string,
  createdBy: string
): Promise<RecordCompanyEventResponse> {
  return recordCompanyEvent(companyId, 'CONTACT_UPDATED', {
    title: 'Contact Updated',
    description: `Updated ${contactName}: ${changes}`,
    metadata: { contactName, changes, changedBy: createdBy }
  }, createdBy);
}

export async function recordPrimaryContactSetForCompany(
  companyId: string,
  contactName: string,
  createdBy: string
): Promise<RecordCompanyEventResponse> {
  return recordCompanyEvent(companyId, 'PRIMARY_CONTACT_SET', {
    title: 'Primary Contact Set',
    description: `${contactName} set as primary contact`,
    metadata: { contactName, changedBy: createdBy }
  }, createdBy);
}

export async function recordDealCreated(
  companyId: string,
  dealName: string,
  createdBy: string
): Promise<RecordCompanyEventResponse> {
  return recordCompanyEvent(companyId, 'DEAL_CREATED', {
    title: 'Deal Created',
    description: `Deal "${dealName}" created`,
    metadata: { dealName, changedBy: createdBy }
  }, createdBy);
}

export async function recordDealStageChanged(
  companyId: string,
  dealName: string,
  fromStage: string,
  toStage: string,
  createdBy: string
): Promise<RecordCompanyEventResponse> {
  return recordCompanyEvent(companyId, 'DEAL_STAGE_CHANGED', {
    title: 'Deal Stage Changed',
    description: `${dealName} moved from ${fromStage} to ${toStage}`,
    metadata: { dealName, fromStage, toStage, changedBy: createdBy }
  }, createdBy);
}

export async function recordDealWon(
  companyId: string,
  dealName: string,
  createdBy: string
): Promise<RecordCompanyEventResponse> {
  return recordCompanyEvent(companyId, 'DEAL_WON', {
    title: 'Deal Won',
    description: `Deal "${dealName}" won`,
    metadata: { dealName, changedBy: createdBy }
  }, createdBy);
}

export async function recordDealLost(
  companyId: string,
  dealName: string,
  createdBy: string
): Promise<RecordCompanyEventResponse> {
  return recordCompanyEvent(companyId, 'DEAL_LOST', {
    title: 'Deal Lost',
    description: `Deal "${dealName}" lost`,
    metadata: { dealName, changedBy: createdBy }
  }, createdBy);
}

export async function recordTaskCreated(
  companyId: string,
  taskTitle: string,
  createdBy: string
): Promise<RecordCompanyEventResponse> {
  return recordCompanyEvent(companyId, 'TASK_CREATED', {
    title: 'Task Created',
    description: taskTitle,
    metadata: { taskTitle, changedBy: createdBy }
  }, createdBy);
}

export async function recordTaskCompleted(
  companyId: string,
  taskTitle: string,
  createdBy: string
): Promise<RecordCompanyEventResponse> {
  return recordCompanyEvent(companyId, 'TASK_COMPLETED', {
    title: 'Task Completed',
    description: taskTitle,
    metadata: { taskTitle, changedBy: createdBy }
  }, createdBy);
}

export async function recordMeetingScheduled(
  companyId: string,
  meetingTitle: string,
  scheduledTime: string,
  createdBy: string
): Promise<RecordCompanyEventResponse> {
  return recordCompanyEvent(companyId, 'meeting_scheduled', {
    title: 'Meeting Scheduled',
    description: `${meetingTitle} at ${scheduledTime}`,
    metadata: { meetingTitle, scheduledTime, changedBy: createdBy }
  }, createdBy);
}

export async function recordCallCompleted(
  companyId: string,
  callTitle: string,
  createdBy: string,
  duration?: number
): Promise<RecordCompanyEventResponse> {
  return recordCompanyEvent(companyId, 'CALL_COMPLETED', {
    title: 'Call Completed',
    description: callTitle,
    metadata: { callTitle, duration, changedBy: createdBy }
  }, createdBy);
}
