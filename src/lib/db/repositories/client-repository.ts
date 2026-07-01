/**
 * Client Repository
 * Server-only data access layer for clients/companies
 * 
 * @serverOnly
 */

import {
  getItem,
  queryItems,
  putItem,
  deleteItem,
  updateItem,
  clientsTable,
} from '../dynamodb';
import { getCached, setCached, invalidateTenantCache, makeCacheKey } from '../../cache';
import { type Client, type CreateClientInput, type UpdateClientInput, type Contact, type ContactPhone } from '../../schemas/client';

/**
 * Helper to extract preferred phone data from phones array
 */
function extractPreferredPhone(phones?: ContactPhone[]): { preferredPhone: string; preferredPhoneType: string } {
  if (!phones || phones.length === 0) {
    return { preferredPhone: '', preferredPhoneType: '' };
  }
  
  const preferred = phones.find(p => p.isPreferred === true);
  if (preferred && preferred.number) {
    return { 
      preferredPhone: preferred.number, 
      preferredPhoneType: preferred.type || '' 
    };
  }
  
  const firstPhone = phones[0];
  if (firstPhone && firstPhone.number) {
    return { 
      preferredPhone: firstPhone.number, 
      preferredPhoneType: firstPhone.type || '' 
    };
  }
  
  return { preferredPhone: '', preferredPhoneType: '' };
}

// Cache TTL: 5 minutes
const CACHE_TTL = 300;

/**
 * Generate a UUID
 */
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get all clients for a tenant
 */
export async function getAllClients(tenantId: string): Promise<Client[]> {
  try {
    const result = await queryItems<Client>(
      clientsTable,
      'tenant_id = :tenantId',
      { ':tenantId': tenantId }
    );
    return result.items || [];
  } catch (error: any) {
    console.error('[getAllClients] Error:', error?.message);
    return [];
  }
}

/**
 * Get a single client by ID
 */
export async function getClientById(tenantId: string, clientId: string): Promise<Client | null> {
  try {
    const client = await getItem<Client>(clientsTable, {
      tenant_id: tenantId,
      id: clientId,
    });
    return client || null;
  } catch (error: any) {
    console.error('[getClientById] Error:', error?.message);
    return null;
  }
}

/**
 * Create a new client
 */
export async function createClient(tenantId: string, data: CreateClientInput): Promise<Client> {
  const client: Client = {
    id: generateId(),
    tenant_id: tenantId,
    name: data.name ?? 'Unknown',
    phone: data.phone || '',
    company: data.company || '',
    domain: data.domain || '',
    industry: data.industry || '',
    city: data.city || '',
    state: data.state || '',
    country: data.country || '',
    employee_count: data.employee_count,
    revenue: data.revenue || '',
    description: data.description || '',
    linkedin_url: data.linkedin_url || '',
    status: data.status || 'identification',
    created_at: new Date().toISOString(),
  };

  if (data.email && String(data.email).trim() !== '') {
    client.email = String(data.email).trim();
  }

  await putItem(clientsTable, client);
  await invalidateTenantCache(tenantId);
  return client;
}

/**
 * Update a client
 */
export async function updateClient(
  tenantId: string,
  clientId: string,
  data: UpdateClientInput
): Promise<Client | null> {
  // Keep your existing update logic or expand as needed
  console.log('[updateClient] Placeholder - implement full logic if needed');
  return null;
}

/**
 * Delete a client
 */
export async function deleteClient(tenantId: string, clientId: string): Promise<void> {
  await deleteItem(clientsTable, { tenant_id: tenantId, id: clientId });
  await invalidateTenantCache(tenantId);
}

// -----------------------------------------------------------------------------
// Contact Management
// -----------------------------------------------------------------------------

/**
 * Add a contact to a client
 * Bulletproof version with logging
 */
export async function addContactToClient(tenantId: string, clientId: string, contact: any) {
  console.log('[addContactToClient] Input:', { tenantId, clientId, contact });

  // CRITICAL SANITIZATION
  const cleanContact = {
    ...contact,
    email: contact.email && String(contact.email).trim() !== '' 
      ? String(contact.email).trim().toLowerCase() 
      : undefined,
  };

  // Remove undefined keys
  Object.keys(cleanContact).forEach(key => {
    if (cleanContact[key] === undefined) delete cleanContact[key];
  });

  const params = {
    TableName: process.env.NEXT_PUBLIC_CLIENTS_TABLE!,
    Item: {
      ...cleanContact,
      tenant_id: tenantId,
      clientId,
      PK: `CONTACT#${crypto.randomUUID()}`,
      SK: `COMPANY#${clientId}`,
      type: 'CONTACT',
      createdAt: new Date().toISOString(),
    },
  };

  console.log('[addContactToClient] Putting item:', JSON.stringify(params.Item));

  try {
    const result = await putItem(params);
    console.log('[addContactToClient] Success');
    return result;
  } catch (error: any) {
    console.error('[addContactToClient] FAILED:', error.message);
    throw error;
  }
}

// Keep the rest of your file (updateClientContact, removeClientContact, etc.) unchanged
// ... (paste the rest of your original file here if needed)
