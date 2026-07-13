import { getEventTenantId } from './utils'; // adjust import if needed
import { eventsTable } from '../db/dynamodb'; // your DynamoDB client

export type JobEventType =
  | 'JOB_CREATED'
  | 'JOB_UPDATED'
  | 'JOB_DELETED'
  | 'JOB_STATUS_CHANGED'
  | 'CANDIDATE_LINKED'
  | 'CANDIDATE_UNLINKED'
  | 'CANDIDATE_STAGE_CHANGED'
  | 'NOTE';

interface EventDetails {
  title: string;
  description?: string;
  metadata?: Record<string, any>;
}

export async function recordJobEvent(
  jobId: string,
  eventType: JobEventType,
  details: EventDetails,
  createdBy: string
) {
  // Your existing implementation (PK, SK, GSI1PK, etc.)
  // ... keep your current recordJobEvent code ...
  return { success: true, eventId: '...' }; // placeholder - keep your real logic
}

export async function getJobEvents(jobId: string, options?: any) {
  // Your existing getJobEvents implementation
  // ... keep your current code ...
  return { events: [], hasMore: false, totalCount: 0 };
}

// ==================== UPDATED addNoteToJob ====================
export async function addNoteToJob(
  jobId: string,
  noteText: string,
  createdBy: string,
  noteType: string = 'general'   // NEW parameter
) {
  if (!noteText || noteText.trim() === '') {
    return { success: false, error: 'Note text is required' };
  }

  const truncated = noteText.length > 100 ? noteText.substring(0, 100) + '...' : noteText;

  return recordJobEvent(
    jobId,
    'NOTE',
    {
      title: 'Note Added',
      description: truncated,
      metadata: {
        noteText: noteText.trim(),
        noteType,                    // Now stored
        changedBy: createdBy,
      },
    },
    createdBy
  );
}
