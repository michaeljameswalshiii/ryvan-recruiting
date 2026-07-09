/**
 * Client Server Actions
 * Server-side CRUD operations for clients using httpOnly cookies
 * 
 * @serverOnly
 */

'use server';

import { revalidatePath } from 'next/cache';
import { getSessionTenantId, getSessionUserId } from '../server-auth';
import { getAllClients, createClient as createClientRepo, getClientById, updateClient, deleteClient, addContactToClient } from '../db/repositories/client-repository';
import { createClientSchema, updateClientSchema, createContactSchema } from '../schemas/client';

/**
 * Get all clients for the current tenant - Safe version
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

/* Keep all your other functions below (createClient, addContactAction, etc.) unchanged */

export async function getClientByIdAction(clientId: string) {
  // ... your existing code ...
}

export async function createClient(formData: FormData) {
  // ... your existing code ...
}

export async function addContactAction(clientId: string, contactData: any) {
  // ... your improved version from earlier ...
}

// ... rest of your file ...
