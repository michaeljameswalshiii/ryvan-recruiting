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
// Add other imports as needed for your other functions

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

// Add your other actions (createClient, addContactAction, etc.) below
// ... 

export async function addContactAction(clientId: string, contactData: any) {
  // Your improved version
  const result = await addContactToClient(/* tenantId logic */, clientId, contactData);
  // ... 
}

// ... rest of your file
