'use server';

import { putItem, queryItems, eventsTable } from '../db/dynamodb';
import type { EventDetails, RecordEventResponse } from './types';

export type JobEventType =
  | 'JOB_CREATED'
  | 'JOB_UPDATED'
  | 'JOB_DELETED'
  | 'JOB_STATUS_CHANGED'
  | 'CANDIDATE_LINKED'
  | 'CANDIDATE_UNLINKED'
  | 'CANDIDATE_STAGE_CHANGED'
  | 'NOTE';

async function getEventTenantId(): Promise<string> {
  const { getSessionTenantId, getSessionUserId } = await import('../server-auth');
  const tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  const final = tenantId || `tenant-${userId || 'default'}`;
  console.log(`[TENANT] Resolved: ${final}`);
  return final;
}

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

    const event = {
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
    console.log(`[recordJobEvent] Success for job ${jobId}, type ${eventType}`);

    return { success: true, eventId };
  } catch (error) {
    console.error('[recordJobEvent] Failed:', error);
    return { success: false, error: String(error) };
  }
}

export async function getJobEvents(
  jobId: string,
  options?: { limit?: number }
) {
  console.log(`[getJobEvents] START for job ${jobId}`);

  try {
    const result = await queryItems(
      eventsTable,
      'PK = :pk',
      { ':pk': `ENTITY#job#${jobId}` },
      { Limit: options?.limit || 50, ScanIndexForward: false }
    );

    const rawEvents = Array.isArray(result) ? result : [];

    console.log(`[getJobEvents] Raw DB items: ${rawEvents.length}`);

    const mapped = rawEvents.map((e: any) => ({
      id: (e.SK || '').replace('EVENT#', ''),
      entityId: e.entityId,
      entityType: 'job',
      eventType: e.eventType,
      title: e.title,
      description: e.description,
      metadata: e.metadata,
      createdAt: e.createdAt,
      createdBy: e.createdBy,
    }));

    console.log(`[getJobEvents] FINAL returning ${mapped.length} events`);
    return { events: mapped, hasMore: false };
  } catch (error) {
    console.error(`[getJobEvents] ERROR:`, error);
    return { events: [] };
  }
}

export async function addNoteToJob(
  jobId: string,
  noteText: string,
  createdBy: string,
  noteType: string = 'general'
) {
  return recordJobEvent(jobId, 'NOTE', {
    title: 'Note Added',
    description: noteText.length > 100 ? noteText.substring(0, 100) + '...' : noteText,
    metadata: { noteText, noteType },
  }, createdBy);
}
