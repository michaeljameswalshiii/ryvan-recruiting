'use server';

import { getSessionTenantId, getSessionUserId } from '@/lib/server-auth';
import { getAllClients, addContactToClient } from '@/lib/db/repositories/client-repository';
import { revalidatePath } from 'next/cache';

/**
 * Get all clients (static test data for now)
 */
export async function getClients() {
  console.log('[getClients] Returning static test data');
  return { 
    clients: [
      { id: 'test1', name: 'Test Company 1', contacts: [] },
      { id: 'test2', name: 'Test Company 2', contacts: [] }
    ] 
  };
}

export async function addContactAction(clientId: string, contactData: any) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return { error: 'No tenant found. Please log in again.' };
    }

    const result = await addContactToClient(tenantId, clientId, contactData);
    revalidatePath('/dashboard/contact-info');
    return { success: true, result };
  } catch (error: any) {
    console.error('[addContactAction] Error:', error);
    return { error: error.message || 'Failed to add contact' };
  }
}
