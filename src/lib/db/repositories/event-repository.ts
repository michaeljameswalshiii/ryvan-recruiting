import { getSessionTenantId } from '@/lib/server-auth';
import {
  putItem,
  queryItems,
  getItem,
  deleteItem,
  updateItem,
} from '../dynamodb';

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
 * Sanitize any value to ensure JSON serializability
 */
function sanitizeValue(value: any): any {
  if (value === undefined || value === null) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  // Handle numeric timestamps
  if (typeof value === 'number') return new Date(value).toISOString();
  return value;
}

/**
 * Sanitize an ActivityEvent to ensure all dates are ISO strings
 */
function sanitizeEvent(item: any): ActivityEvent {
  return {
    id: item.id,
    contactId: item.contactId,
    companyId: item.companyId,
    type: item.type,
    content: item.content,
    createdAt: sanitizeValue(item.createdAt),
    createdBy: item.createdBy,
    metadata: item.metadata,
  };
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

  // Sanitize all events to ensure JSON serializability
  return {
    events: (result.items || []).map(sanitizeEvent),
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

  // Sanitize all events to ensure JSON serializability
  return {
    events: (result.items || []).map(sanitizeEvent),
  };
}

/**
 * Update an existing event
 */
export async function updateEvent(
  eventId: string,
  contactId: string,
  updates: { type?: string; content?: string }
): Promise<{ success: boolean; event: ActivityEvent }> {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    throw new Error('No tenant ID found in session');
  }

  // First, find the event to get its SK
  const prefix = `CONTACT#${contactId}#EVENT#`;
  const result = await queryItems<any>(
    EVENTS_TABLE,
    'PK = :pk AND begins_with(SK, :prefix)',
    { ':pk': tenantId, ':prefix': prefix },
    { limit: 200 }
  );

  const existingItem = result.items?.find((item: any) => item.id === eventId);
  if (!existingItem) {
    throw new Error('Event not found');
  }

  // Build update expression
  const updateExpressions: string[] = [];
  const expressionValues: Record<string, any> = {};
  const expressionNames: Record<string, string> = {};

  if (updates.type) {
    updateExpressions.push('#type = :type');
    expressionValues[':type'] = updates.type;
    expressionNames['#type'] = 'type';
  }
  if (updates.content !== undefined) {
    updateExpressions.push('#content = :content');
    expressionValues[':content'] = updates.content;
    expressionNames['#content'] = 'content';
  }

if (updateExpressions.length === 0) {
    return { success: true, event: sanitizeEvent(existingItem) };
  }

  await updateItem(
    EVENTS_TABLE,
    { PK: tenantId, SK: existingItem.SK },
    'SET ' + updateExpressions.join(', '),
    expressionValues,
    expressionNames
  );

  // Return sanitized event
  return {
    success: true,
    event: sanitizeEvent({
      id: existingItem.id,
      contactId: existingItem.contactId,
      companyId: existingItem.companyId,
      type: updates.type || existingItem.type,
      content: updates.content ?? existingItem.content,
      createdAt: existingItem.createdAt,
      createdBy: existingItem.createdBy,
      metadata: existingItem.metadata,
    }),
  };
}

/**
 * Delete an event
 */
export async function deleteEvent(
  eventId: string,
  contactId: string
): Promise<{ success: boolean }> {
  const tenantId = await getSessionTenantId();
  if (!tenantId) {
    throw new Error('No tenant ID found in session');
  }

  // First, find the event to get its SK
  const prefix = `CONTACT#${contactId}#EVENT#`;
  const result = await queryItems<any>(
    EVENTS_TABLE,
    'PK = :pk AND begins_with(SK, :prefix)',
    { ':pk': tenantId, ':prefix': prefix },
    { limit: 200 }
  );

  const existingItem = result.items?.find((item: any) => item.id === eventId);
  if (!existingItem) {
    throw new Error('Event not found');
  }

  await deleteItem(EVENTS_TABLE, { PK: tenantId, SK: existingItem.SK });

  return { success: true };
}
