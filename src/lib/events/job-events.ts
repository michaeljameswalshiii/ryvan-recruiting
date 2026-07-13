/**
 * Job Events Service
 * Records and retrieves job events from DynamoDB (aligned with candidate-events.ts)
 * 
 * @serverOnly
 */

'use server';

import { putItem, queryItems, eventsTable } from '../db/dynamodb';
import type {
  EventDetails,
  RecordEventResponse,
  PaginationCursor,
} from './types';

export type JobEventType =
  | 'JOB_CREATED'
  | 'JOB_UPDATED'
  | 'JOB_DELETED'
  | 'JOB_STATUS_CHANGED'
  | 'CANDIDATE_LINKED'
  | 'CANDIDATE_UNLINKED'
  | 'CANDIDATE_STAGE_CHANGED'
  | 'NOTE';

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 100;

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function logEvent(level: LogLevel, message: string, meta?: any) {
  const timestamp = new Date().toISOString();
  switch (level) {
    case 'error': console.error(`[JOB_EVENTS] ${message}`, meta); break;
    case 'warn': console.warn(`[JOB_EVENTS] ${message}`, meta); break;
    default: console.log(`[JOB_EVENTS] ${message}`, meta);
  }
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRY_ATTEMPTS) {
        await new Promise(r => setTimeout(r, RETRY_BASE_DELAY_MS * Math.pow(2, attempt-1)));
      }
    }
  }
  throw lastError;
}

async function getEventTenantId(): Promise<string> {
  const { getSessionTenantId, getSessionUserId } = await import('../server-auth');
  const tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  if (!tenantId && userId) return `tenant-${userId}`;
  return tenantId || 'default-tenant';
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
    logEvent('info', 'Job event recorded', { jobId, eventType, eventId });

    return { success: true, eventId };
  } catch (error) {
    logEvent('error', 'Failed to record job event', { jobId, error: String(error) });
    return { success: false, error: String(error) };
  }
}

// FIXED: Direct PK query for reliability
export async function getJobEvents(
  jobId: string,
  options?: { limit?: number; cursor?: PaginationCursor; eventTypes?: JobEventType[] }
) {
  try {
    const { limit = 50 } = options || {};
    const tenantId = await getEventTenantId();

    console.log(`[getJobEvents] DIRECT QUERY for job ${jobId}, tenant ${tenantId}`);

    const events = await queryItems(
      eventsTable,
      'PK = :pk AND begins_with(SK, :prefix)',
      {
        ':pk': `ENTITY#job#${jobId}`,
        ':prefix': 'EVENT#',
      },
      { ScanIndexForward: false }
    );

    console.log(`[getJobEvents] Raw DB items found: ${events.length}`);

    let filtered = events;
    if (options?.eventTypes?.length) {
      filtered = events.filter((e: any) => options.eventTypes!.includes(e.eventType));
    }

    const eventResults = filtered.map((e: any) => ({
      id: e.SK.replace('EVENT#', ''),
      entityId: e.entityId,
      entityType: 'job',
      eventType: e.eventType,
      title: e.title,
      description: e.description,
      metadata: e.metadata,
      createdAt: e.createdAt,
      createdBy: e.createdBy,
    }));

    return { 
      events: eventResults, 
      hasMore: false,
      totalCount: eventResults.length 
    };
  } catch (error) {
    logEvent('error', 'Failed to get job events', { error: String(error) });
    return { events: [] };
  }
}

// Keep the rest of your helper functions (recordJobCreated, addNoteToJob, etc.) unchanged at the bottom
