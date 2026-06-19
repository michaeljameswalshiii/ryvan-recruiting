'use server';

import { createEvent, getEventsForContact, updateEvent, deleteEvent } from '../db/repositories';
import { revalidatePath } from 'next/cache';

/**
 * Helper to safely convert any value to ISO string for dates
 */
function sanitizeDate(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  // Handle timestamps or numeric values
  const date = new Date(value);
  if (!isNaN(date.getTime())) return date.toISOString();
  return undefined;
}

/**
 * Sanitize an event object to ensure JSON serializability
 */
function sanitizeEvent(event: any): any {
  if (!event) return event;
  return {
    id: event.id,
    type: event.type,
    content: event.content,
    // Handle createdAt - could be Date, string, or timestamp
    createdAt: sanitizeDate(event.createdAt),
    createdBy: event.createdBy,
    contactId: event.contactId,
    companyId: event.companyId,
    // Handle metadata if present
    metadata: event.metadata ? { ...event.metadata } : undefined,
  };
}

export async function logContactActivity(data: {
  contactId: string;
  companyId?: string;
  type: string;
  content: string;
  relatedJobId?: string;
}) {
  // Create event using the repository pattern
  const rawResult = await createEvent({
    contactId: data.contactId,
    companyId: data.companyId,
    type: data.type,
    content: data.content,
    createdBy: 'current-user', // improve later with auth user
  });

  if (!rawResult.success) {
    throw new Error('Failed to create activity event');
  }

  revalidatePath(`/dashboard/contacts/${data.contactId}`);
  
  // Sanitize the returned event
  return sanitizeEvent(rawResult.event);
}

export async function getContactActivities(contactId: string) {
  const { events } = await getEventsForContact(contactId);
  
  // Sanitize all events to ensure JSON serializability
  return (events || []).map(sanitizeEvent);
}

export async function updateContactActivity(data: {
  contactId: string;
  activityId: string;
  type: string;
  content: string;
}) {
  const result = await updateEvent(data.activityId, data.contactId, {
    type: data.type,
    content: data.content,
  });

  if (!result.success) {
    throw new Error('Failed to update activity event');
  }

  revalidatePath(`/dashboard/contacts/${data.contactId}`);
  
  // Sanitize the returned event
  return sanitizeEvent(result.event);
}

export async function deleteContactActivity(data: {
  contactId: string;
  activityId: string;
}) {
  const result = await deleteEvent(data.activityId, data.contactId);

  if (!result.success) {
    throw new Error('Failed to delete activity event');
  }

  revalidatePath(`/dashboard/contacts/${data.contactId}`);
  return { success: true };
}
