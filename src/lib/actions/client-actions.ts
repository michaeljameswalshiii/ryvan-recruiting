/**
 * Client Server Actions
 * Server-side CRUD operations for clients using httpOnly cookies
 * 
 * @serverOnly
 */

'use server';

import { revalidatePath } from 'next/cache';
import { getSessionTenantId, getSessionUserId } from '../server-auth';
import { getAllClients, createClient as createClientRepo, getClientById, updateClient, deleteClient, addContactToClient, updateClientContact, removeClientContact } from '../db/repositories/client-repository';
import { createClientSchema, updateClientSchema, createContactSchema } from '../schemas/client';

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

/* ... (getClientByIdAction, createClient, updateClientAction, deleteClientAction, updateClientStatusAction remain the same as before) ... */

// Keep your existing functions above and replace only the contact section with this improved version:

// ---------------------------------------------------------------------
// Contact Management Actions - IMPROVED
// ---------------------------------------------------------------------

/**
 * Add a contact to a client - FIXED with better error handling
 */
export async function addContactAction(clientId: string, contactData: any) {
  let tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();

  if (!tenantId && userId) tenantId = `tenant-${userId}`;

  if (!tenantId || !userId) {
    console.error('[addContactAction] Unauthorized');
    return { error: 'Unauthorized: No tenant or user context' };
  }

  const cleanData = {
    name: contactData.name?.trim(),
    email: contactData.email && contactData.email.trim() !== '' ? contactData.email.trim().toLowerCase() : undefined,
    phone: contactData.phone?.trim(),
    title: contactData.title?.trim(),
    isPrimary: contactData.isPrimary || false,
    notes: contactData.notes?.trim(),
  };

  const validated = createContactSchema.safeParse(cleanData);

  if (!validated.success) {
    console.error('[addContactAction] Validation failed:', validated.error.flatten());
    return { 
      error: 'Invalid contact data', 
      details: validated.error.flatten().fieldErrors 
    };
  }

  try {
    console.log('[addContactAction] Adding contact to client:', clientId, 'tenant:', tenantId);
    
    const client = await addContactToClient(tenantId, clientId, validated.data);

    if (!client) {
      return { error: 'Failed to add contact - client not found' };
    }

    console.log('[addContactAction] Success');
    revalidatePath('/dashboard/contact-info');
    return { success: true, client };
  } catch (error: any) {
    console.error('[addContactAction] Full error:', error?.message, error?.stack);
    
    if (error?.message?.toLowerCase().includes('unique') || error?.message?.toLowerCase().includes('duplicate')) {
      return { error: 'A contact with this email already exists' };
    }
    if (error?.message?.toLowerCase().includes('validation')) {
      return { error: 'Invalid contact information provided' };
    }

    return { 
      error: error.message || 'Failed to add contact. Please check your input and try again.' 
    };
  }
}

//
