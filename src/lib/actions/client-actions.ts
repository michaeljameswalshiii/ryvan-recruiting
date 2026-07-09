/**
 * Client Server Actions
 * Server-side CRUD operations for clients using httpOnly cookies
 * 
 * @serverOnly
 */

'use server';

import { revalidatePath } from 'next/cache';
import { getSessionTenantId, getSessionUserId } from '@/lib/server-auth';
import { getAllClients, addContactToClient } from '@/lib/db/repositories/client-repository';

/**
 * Get all clients for the current tenant
 */
export async function getClients() {
  let tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();

  console.log('[getClients] Starting - tenantId:', tenantId, 'userId:', userId);

  if (!tenantId && userId) {
    tenantId = `tenant-${userId}`;
    console.log('[getClients] Using fallback tenantId:', tenantId);
  }

  if (!tenantId) {
    console.log('[getClients] No tenant - returning empty clients');
    return { clients: [] };
  }

  try {
    console.log('[getClients] Calling getAllClients with tenantId:', tenantId);
    const clients = await getAllClients(tenantId);
    console.log('[getClients] Got clients:', clients?.length);
    return { clients };
  } catch (error: any) {
    console.error('[getClients] Error:', error);
    return { error: error.message || 'Failed to get clients' };
  }
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

// Add other actions as needed...
