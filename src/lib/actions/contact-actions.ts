'use server';

import { createEvent, getEventsForContact } from '../db/repositories';
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
