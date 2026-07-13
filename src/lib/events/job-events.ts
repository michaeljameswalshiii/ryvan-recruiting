'use server';

import { putItem, queryItems, eventsTable } from '../db/dynamodb';
import type { EventDetails, RecordEventResponse, PaginationCursor } from './types';

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
    const tenantId = await getEventTenantId();
    console.log(`[getJobEvents] Using tenant: ${tenantId}`);

    const rawEvents = await queryItems(
      eventsTable,
      'GSI1PK = :gsi1pk',
      { ':gsi1pk': `TENANT#${tenantId}` },
      { IndexName: 'GSI1', Limit: options?.limit || 50, ScanIndexForward: false }
    );

    console.log(`[getJobEvents] Raw DB items: ${rawEvents.length}`);

    let filtered = rawEvents.filter((e: any) => e.entityId === jobId && e.entityType === 'job');
    console.log(`[getJobEvents] After filter: ${filtered.length}`);

    const sorted = filtered.sort((a: any, b: any) => (b.SK || '').localeCompare(a.SK || ''));
    const limited = sorted.slice(0, options?.limit || 50);

    const mapped = limited.map((e: any) => ({
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
    return { events: mapped, hasMore: sorted.length > (options?.limit || 50) };
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
