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
 * Get all clients - STATIC TEST DATA (to isolate the loop)
 */
export async function getClients() {
  console.log('[getClients] Returning static test data for debugging');
  return { 
    clients: [
      { 
        id: 'test1', 
        name: 'Test Company 1', 
        contacts: [] 
      },
      { 
        id: 'test2', 
        name: 'Test Company 2', 
        contacts: [] 
      }
    ] 
  };
}

/* Keep all your other functions (createClient, addContactAction, etc.) as they are below */

export async function getClientByIdAction(clientId: string) {
  // ... your existing code ...
}

export async function createClient(formData: FormData) {
  // ... your existing code ...
}

// ... keep the rest of your file unchanged ...

export async function addContactAction(clientId: string, contactData: any) {
  // ... your improved version from earlier ...
}
