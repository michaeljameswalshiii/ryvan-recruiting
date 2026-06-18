'use server';

import { createEvent, getEventsForContact, updateEvent, deleteEvent } from '../db/repositories';
import { revalidatePath } from 'next/cache';

export async function logContactActivity(data: {
  contactId: string;
  companyId?: string;
  type: string;
  content: string;
  relatedJobId?: string;
}) {
  // Create event using the repository pattern
  const result = await createEvent({
    contactId: data.contactId,
    companyId: data.companyId,
    type: data.type,
    content: data.content,
    createdBy: 'current-user', // improve later with auth user
  });

  if (!result.success) {
    throw new Error('Failed to create activity event');
  }

  revalidatePath(`/dashboard/contacts/${data.contactId}`);
  return result.event;
}

export async function getContactActivities(contactId: string) {
  const { events } = await getEventsForContact(contactId);
  return events;
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
  return result.event;
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
