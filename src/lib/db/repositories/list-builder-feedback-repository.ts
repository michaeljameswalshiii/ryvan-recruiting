/**
 * Per-user list-builder preference memory.
 * Stored in profiles. Only written on explicit accept / reject / revise.
 *
 * @serverOnly
 */

import { getItem, putItem, tableNames } from '../dynamodb';
import type {
  ListBuilderFeedbackEvent,
  ListBuilderFeedbackStore,
} from '../../schemas/list-builder-feedback';
import { LIST_BUILDER_FEEDBACK_MAX_EVENTS } from '../../schemas/list-builder-feedback';

function storeKey(tenantId: string, userId: string): string {
  return `lb-feedback#${tenantId}#${userId}`;
}

function eventId(): string {
  return `fb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getListBuilderFeedback(
  tenantId: string,
  userId: string
): Promise<ListBuilderFeedbackStore | null> {
  try {
    const item = await getItem<ListBuilderFeedbackStore>(tableNames.profiles, {
      id: storeKey(tenantId, userId),
    });
    if (!item || item.type !== 'list_builder_feedback') return null;
    if (item.tenant_id !== tenantId) return null;
    return item;
  } catch {
    return null;
  }
}

export async function recordListBuilderFeedback(
  tenantId: string,
  userId: string,
  event: Omit<ListBuilderFeedbackEvent, 'id' | 'userId' | 'createdAt'>
): Promise<ListBuilderFeedbackEvent> {
  const full: ListBuilderFeedbackEvent = {
    ...event,
    id: eventId(),
    userId,
    createdAt: new Date().toISOString(),
    examples: (event.examples || []).slice(0, 12),
    brief: (event.brief || '').slice(0, 500),
    reason: event.reason ? event.reason.slice(0, 400) : undefined,
    revisedBrief: event.revisedBrief
      ? event.revisedBrief.slice(0, 500)
      : undefined,
  };

  const existing = await getListBuilderFeedback(tenantId, userId);
  const events = [full, ...(existing?.events || [])].slice(
    0,
    LIST_BUILDER_FEEDBACK_MAX_EVENTS
  );

  const store: ListBuilderFeedbackStore = {
    id: storeKey(tenantId, userId),
    tenant_id: tenantId,
    userId,
    type: 'list_builder_feedback',
    events,
    updatedAt: new Date().toISOString(),
  };
  await putItem(tableNames.profiles, store);
  return full;
}

export async function listRecentListBuilderFeedback(
  tenantId: string,
  userId: string,
  limit = 24
): Promise<ListBuilderFeedbackEvent[]> {
  const store = await getListBuilderFeedback(tenantId, userId);
  return (store?.events || []).slice(0, Math.max(1, limit));
}
