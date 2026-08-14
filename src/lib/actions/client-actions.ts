'use server';

import { revalidatePath, unstable_noStore as noStore } from 'next/cache';
import {
  getSessionTenantId,
  getSessionUserId,
  getSessionUserEmail,
} from '@/lib/server-auth';
import {
  getAllClients,
  addContactToClient,
  updateClientContact,
  removeClientContact,
} from '@/lib/db/repositories/client-repository';
import { normalizeContactPhones } from '@/lib/contacts/phone';

async function resolveTenantId(): Promise<string | null> {
  let tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  if (!tenantId && userId) tenantId = `tenant-${userId}`;
  return tenantId || null;
}

/**
 * Get all clients for the current tenant (real data)
 */
export async function getClients() {
  noStore();
  console.log('=== USING getClients from client-actions.ts ===');

  try {
    const tenantId = await resolveTenantId();
    const userId = await getSessionUserId();

    console.log('[getClients] Starting - tenantId:', tenantId, 'userId:', userId);

    if (!tenantId) {
      console.log('[getClients] No tenant - returning empty');
      return { clients: [] };
    }

    const clients = await getAllClients(tenantId);
    console.log('[getClients] Successfully loaded', clients?.length || 0, 'clients');
    return { clients };
  } catch (error: any) {
    console.error('[getClients] Error:', error);
    return { clients: [], error: error.message || 'Failed to get clients' };
  }
}

export async function addContactAction(clientId: string, contactData: any) {
  try {
    const tenantId = await resolveTenantId();
    if (!tenantId) {
      return { error: 'No tenant found. Please log in again.' };
    }

    const phoneFields = normalizeContactPhones({
      phone: contactData?.phone,
      phones: contactData?.phones,
      workPhone: contactData?.workPhone || contactData?.work_phone,
      mobilePhone:
        contactData?.mobilePhone ||
        contactData?.mobile_phone ||
        contactData?.cellPhone ||
        contactData?.cell_phone,
    });

    const payload = {
      name: typeof contactData?.name === 'string' ? contactData.name.trim() : '',
      title: typeof contactData?.title === 'string' ? contactData.title.trim() : '',
      email: typeof contactData?.email === 'string' ? contactData.email.trim() : '',
      isPrimary: !!contactData?.isPrimary,
      notes: typeof contactData?.notes === 'string' ? contactData.notes : '',
      tags: Array.isArray(contactData?.tags) ? contactData.tags : undefined,
      ...phoneFields,
    };

    if (!payload.name) {
      return { error: 'Contact name is required' };
    }

    const userId = await getSessionUserId();
    const email = await getSessionUserEmail();
    const result = await addContactToClient(
      tenantId,
      clientId,
      payload,
      userId ? { userId, email } : undefined,
    );
    revalidatePath('/dashboard/contact-info');
    revalidatePath('/dashboard/companies');
    revalidatePath(`/dashboard/companies/${clientId}`);
    return { success: true, result };
  } catch (error: any) {
    console.error('[addContactAction] Error:', error);
    return { error: error.message || 'Failed to add contact' };
  }
}

export async function updateContactAction(
  clientId: string,
  contactId: string,
  contactData: any
) {
  try {
    const tenantId = await resolveTenantId();
    if (!tenantId) {
      return { error: 'No tenant found. Please log in again.' };
    }

    const phoneFields = normalizeContactPhones({
      phone: contactData?.phone,
      phones: contactData?.phones,
      workPhone: contactData?.workPhone || contactData?.work_phone,
      mobilePhone:
        contactData?.mobilePhone ||
        contactData?.mobile_phone ||
        contactData?.cellPhone ||
        contactData?.cell_phone,
    });

    const result = await updateClientContact(tenantId, clientId, contactId, {
      ...contactData,
      ...phoneFields,
    });

    if (!result) {
      return { error: 'Client or contact not found' };
    }

    revalidatePath('/dashboard/contact-info');
    revalidatePath(`/dashboard/contact-info/${contactId}`);
    revalidatePath('/dashboard/companies');
    revalidatePath(`/dashboard/companies/${clientId}`);
    return { success: true, contactId };
  } catch (error: any) {
    console.error('[updateContactAction] Error:', error);
    return { error: error.message || 'Failed to update contact' };
  }
}

export async function removeContactAction(clientId: string, contactId: string) {
  try {
    const tenantId = await resolveTenantId();
    if (!tenantId) {
      return { error: 'No tenant found. Please log in again.' };
    }

    const result = await removeClientContact(tenantId, clientId, contactId);
    if (!result) {
      return { error: 'Client or contact not found' };
    }

    revalidatePath('/dashboard/contact-info');
    revalidatePath('/dashboard/companies');
    revalidatePath(`/dashboard/companies/${clientId}`);
    return { success: true, contactId };
  } catch (error: any) {
    console.error('[removeContactAction] Error:', error);
    return { error: error.message || 'Failed to remove contact' };
  }
}
