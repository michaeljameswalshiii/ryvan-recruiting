/**
 * Event Repository
 * Server-only data access layer for Activity Events (Notes)
 * Uses separate turnkey-events table with PK/SK pattern
 * 
 * @serverOnly
 */

import { getSessionTenantId } from '@/lib/server-auth';
import { putItem, queryItems } from '../dynamodb';

const EVENTS_TABLE = process.env.DYNAMODB_EVENTS_TABLE || 'turnkey-events';

export interface ActivityEvent {
  id: string;
  contactId: string;
  companyId?: string;
  type: string;
  content: string;
  createdAt: string;
  createdBy: string;
  metadata?: Record<string, any>;
}

/**
 * Create a new activity/note event
 */
export async function createEvent(
  input: Omit<ActivityEvent, 'id' | 'createdAt'> & { tenantId?: string }
): Promise<{ success: boolean; event: ActivityEvent }> {
  const tenantId = input.tenantId || (await getSessionTenantId());
  if (!tenantId) {
    throw new Error('No tenant ID found in session');
  }

  const now = new Date().toISOString();
  const id = `note_${Date.now()}`;

  const item = {
    PK: tenantId,
    SK: `CONTACT#${input.contactId}#EVENT#${now}`,
    id,
    tenant_id: tenantId,
    contactId: input.contactId,
    companyId: input.companyId,
    type: input.type,
    content: input.content,
    createdAt: now,
    createdBy: input.createdBy || 'current-user',
    metadata: input.metadata || {},
  };

  await putItem(EVENTS_TABLE, item);

  return {
    success: true,
    event: {
      id,
      contactId: input.contactId,
      companyId: input.companyId,
      type: input.type,
      content: input.content,
      createdAt: now,
      createdBy: input.createdBy || 'current-user',
      metadata: input.metadata,
    },
  };
}

/**
 * Get all events/notes for a specific contact (newest first)
 */
export async function getEventsForContact(
  contactId: string,
  options: { limit?: number; lastKey?: any } = {}
): Promise<{ events: ActivityEvent[]; lastKey?: any }> {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    throw new Error('No tenant ID found in session');
  }

  const prefix = `CONTACT#${contactId}#EVENT#`;

const result = await queryItems<any>(
    EVENTS_TABLE,
    'PK = :pk AND begins_with(SK, :prefix)',
    { ':pk': tenantId, ':prefix': prefix },
    {
      limit: options.limit || 200,
      ScanIndexForward: false, // newest first
      ExclusiveStartKey: options.lastKey,
    }
  );

  return {
    events: (result.items || []).map((item: any) => ({
      id: item.id,
      contactId: item.contactId,
      companyId: item.companyId,
      type: item.type,
      content: item.content,
      createdAt: item.createdAt,
      createdBy: item.createdBy,
      metadata: item.metadata,
    })),
    lastKey: result.lastEvaluatedKey,
  };
}

/**
 * (Optional) Get recent events across the tenant
 */
export async function getRecentEvents(limit = 50) {
  const tenantId = await getSessionTenantId();
  if (!tenantId) return { events: [] };

  const result = await queryItems<any>(
    EVENTS_TABLE,
    'PK = :pk',
    { ':pk': tenantId },
    {
      limit: limit,
      ScanIndexForward: false,
    }
  );

  return {
    events: result.items || [],
  };
}
