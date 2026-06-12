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
  
  // Find phone marked as preferred
  const preferred = phones.find(p => p.isPreferred === true);
  if (preferred && preferred.number) {
    return { 
      preferredPhone: preferred.number, 
      preferredPhoneType: preferred.type || '' 
    };
  }
  
  // Fall back to first phone in array
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
 * NOTE: Cache disabled for now - causes issues with Vercel serverless
 */
export async function getAllClients(tenantId: string): Promise<Client[]> {
  // Directly query DynamoDB without caching
  // (Vercel's in-memory cache doesn't work across instances)
  
  // Query from DynamoDB
  const clients = await queryItems<Client>(
    clientsTable,
    'tenant_id = :tenantId',
    { ':tenantId': tenantId }
  );
  
  return clients;
}

/**
 * Get a single client by ID
 */
export async function getClientById(tenantId: string, clientId: string): Promise<Client | null> {
  try {
    const cacheKey = makeCacheKey(tenantId, 'clients', clientId);
    
    // Try cache first
    const cached = await getCached<Client>(cacheKey);
    if (cached) {
      console.log('[getClientById] Cache hit for client:', clientId);
      return cached;
    }
    
    console.log('[getClientById] Querying DynamoDB for client:', { tenantId, clientId });
    
    // Get from DynamoDB
    const client = await getItem<Client>(clientsTable, {
      tenant_id: tenantId,
      id: clientId,
    });
    
    if (!client) {
      console.log('[getClientById] Client not found in DynamoDB:', { tenantId, clientId });
      return null;
    }
    
    console.log('[getClientById] Client found:', client.name);
    await setCached(cacheKey, client, CACHE_TTL);
    
    return client;
  } catch (error) {
    console.error('[getClientById] Error fetching client:', { tenantId, clientId, error });
    throw error;
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
    email: data.email || '',
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
  
  // Save to DynamoDB
  await putItem(clientsTable, client);
  
  // Invalidate cache
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
  // Build update expression
  const updates: string[] = [];
  const values: Record<string, unknown> = {};
  const names: Record<string, string> = {};
  
  if (data.name !== undefined) {
    updates.push('#name = :name');
    values[':name'] = data.name;
    names['#name'] = 'name';
  }
  if (data.email !== undefined) {
    updates.push('#email = :email');
    values[':email'] = data.email;
    names['#email'] = 'email';
  }
  if (data.phone !== undefined) {
    updates.push('#phone = :phone');
    values[':phone'] = data.phone;
    names['#phone'] = 'phone';
  }
  if (data.company !== undefined) {
    updates.push('#company = :company');
    values[':company'] = data.company;
    names['#company'] = 'company';
  }
  if (data.domain !== undefined) {
    updates.push('#domain = :domain');
    values[':domain'] = data.domain;
    names['#domain'] = 'domain';
  }
  if (data.industry !== undefined) {
    updates.push('#industry = :industry');
    values[':industry'] = data.industry;
    names['#industry'] = 'industry';
  }
  if (data.city !== undefined) {
    updates.push('#city = :city');
    values[':city'] = data.city;
    names['#city'] = 'city';
  }
  if (data.state !== undefined) {
    updates.push('#state = :state');
    values[':state'] = data.state;
    names['#state'] = 'state';
  }
  if (data.country !== undefined) {
    updates.push('#country = :country');
    values[':country'] = data.country;
    names['#country'] = 'country';
  }
  if (data.employee_count !== undefined) {
    updates.push('#employee_count = :employee_count');
    values[':employee_count'] = data.employee_count;
    names['#employee_count'] = 'employee_count';
  }
  if (data.revenue !== undefined) {
    updates.push('#revenue = :revenue');
    values[':revenue'] = data.revenue;
    names['#revenue'] = 'revenue';
  }
  if (data.description !== undefined) {
    updates.push('#description = :description');
    values[':description'] = data.description;
    names['#description'] = 'description';
  }
if (data.linkedin_url !== undefined) {
    updates.push('#linkedin_url = :linkedin_url');
    values[':linkedin_url'] = data.linkedin_url;
    names['#linkedin_url'] = 'linkedin_url';
  }
  if (data.status !== undefined) {
    updates.push('#status = :status');
    values[':status'] = data.status;
    names['#status'] = 'status';
  }
  
  if (updates.length === 0) {
    return getClientById(tenantId, clientId);
  }
  
  // Always update modified_at
  updates.push('#modified_at = :modified_at');
  values[':modified_at'] = new Date().toISOString();
  names['#modified_at'] = 'modified_at';
  
const updated = await updateItem<Client>(
    clientsTable,
    { tenant_id: tenantId, id: clientId },
    `SET ${updates.join(', ')}`,
    values,
    names
  );
  
  // Invalidate cache
  await invalidateTenantCache(tenantId);
  
  return updated;
}

/**
 * Delete a client
 */
export async function deleteClient(tenantId: string, clientId: string): Promise<void> {
  await deleteItem(clientsTable, { tenant_id: tenantId, id: clientId });
  
  // Invalidate cache
  await invalidateTenantCache(tenantId);
}

// -----------------------------------------------------------------------------
// Contact Management
// -----------------------------------------------------------------------------

/**
 * Add a contact to a client
 */
export async function addContactToClient(
  tenantId: string,
  clientId: string,
  contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Client | null> {
  const client = await getClientById(tenantId, clientId);
  if (!client) {
    return null;
  }

  const now = new Date().toISOString();
  
  // Auto-calculate preferredPhone/preferredPhoneType from phones array
  const preferredData = extractPreferredPhone(contact.phones);
  
  const newContact: Contact = {
    id: generateId(),
    ...contact,
    ...preferredData,
    createdAt: now,
    updatedAt: now,
  };

  // Get existing contacts or initialize empty array
  const existingContacts = client.contacts || [];
  
  // If setting as primary, unset other primaries
  let updatedContacts = existingContacts;
  if (contact.isPrimary) {
    updatedContacts = existingContacts.map(c => ({
      ...c,
      isPrimary: false,
      updatedAt: now,
    }));
  }

  // Add new contact
  updatedContacts = [...updatedContacts, newContact];

  // Determine primary contact ID
  let primaryContactId = client.primaryContactId;
  if (contact.isPrimary || !primaryContactId) {
    primaryContactId = newContact.id;
  }

  return updateItem<Client>(
    clientsTable,
    { tenant_id: tenantId, id: clientId },
    'SET #contacts = :contacts, #primaryContactId = :primaryContactId, #modified_at = :modified_at',
    {
      ':contacts': updatedContacts,
      ':primaryContactId': primaryContactId,
      ':modified_at': now,
    },
    {
      '#contacts': 'contacts',
      '#primaryContactId': 'primaryContactId',
      '#modified_at': 'modified_at',
    }
  );
}

/**
 * Update a contact on a client
 */
export async function updateClientContact(
  tenantId: string,
  clientId: string,
  contactId: string,
  data: Partial<Omit<Contact, 'id' | 'createdAt'>> 
): Promise<Client | null> {
  const client = await getClientById(tenantId, clientId);
  if (!client) {
    return null;
  }

  const contacts = client.contacts || [];
  const contactIndex = contacts.findIndex(c => c.id === contactId);
  if (contactIndex === -1) {
    return null;
  }

  const now = new Date().toISOString();
  const updatedContacts = [...contacts];
  
  // Handle primary flag change
  if (data.isPrimary !== undefined) {
    if (data.isPrimary) {
      // Unset all other primaries
      updatedContacts.forEach((c, i) => {
        if (c.isPrimary && i !== contactIndex) {
          updatedContacts[i] = { ...c, isPrimary: false, updatedAt: now };
        }
      });
    }
  }

  // Auto-calculate preferredPhone/preferredPhoneType if phones array is being updated
  const phonesToUse = data.phones ?? updatedContacts[contactIndex].phones;
  const preferredData = extractPreferredPhone(phonesToUse);

  // Update the contact with all data including flattened fields
  updatedContacts[contactIndex] = {
    ...updatedContacts[contactIndex],
    ...data,
    ...preferredData,
    updatedAt: now,
  };

  // Determine primary contact ID
  let primaryContactId = client.primaryContactId;
  if (data.isPrimary === true) {
    primaryContactId = contactId;
  } else if (data.isPrimary === false && client.primaryContactId === contactId) {
    // Find new primary
    const newPrimary = updatedContacts.find(c => c.isPrimary && c.id !== contactId);
    primaryContactId = newPrimary?.id;
  }

  const result = await updateItem<Client>(
    clientsTable,
    { tenant_id: tenantId, id: clientId },
    'SET #contacts = :contacts, #primaryContactId = :primaryContactId, #modified_at = :modified_at',
    {
      ':contacts': updatedContacts,
      ':primaryContactId': primaryContactId ?? null,
      ':modified_at': now,
    },
    {
      '#contacts': 'contacts',
      '#primaryContactId': 'primaryContactId',
      '#modified_at': 'modified_at',
    }
  );

  // Invalidate cache
  await invalidateTenantCache(tenantId);

  return result;
}

/**
 * Remove a contact from a client
 */
export async function removeClientContact(
  tenantId: string,
  clientId: string,
  contactId: string
): Promise<Client | null> {
  const client = await getClientById(tenantId, clientId);
  if (!client) {
    return null;
  }

const contacts = (client.contacts || []).filter(c => c.id !== contactId);
  
  // Determine if we need to update primary contact ID
  let primaryContactId: string | undefined = client.primaryContactId;
  if (client.primaryContactId === contactId) {
    const newPrimary = contacts.find(c => c.isPrimary);
    primaryContactId = newPrimary?.id;
  }

  const now = new Date().toISOString();

  const result = await updateItem<Client>(
    clientsTable,
    { tenant_id: tenantId, id: clientId },
    'SET #contacts = :contacts, #primaryContactId = :primaryContactId, #modified_at = :modified_at',
    {
      ':contacts': contacts,
      ':primaryContactId': primaryContactId ?? null,
      ':modified_at': now,
    },
    {
      '#contacts': 'contacts',
      '#primaryContactId': 'primaryContactId',
      '#modified_at': 'modified_at',
    }
  );

  // Invalidate cache
  await invalidateTenantCache(tenantId);

  return result;
}

/**
 * Set primary contact for a client
 */
export async function setPrimaryContact(
  tenantId: string,
  clientId: string,
  contactId: string
): Promise<Client | null> {
  return updateClientContact(tenantId, clientId, contactId, { isPrimary: true });
}

/**
 * Get primary contact for a client
 */
export async function getPrimaryContact(
  tenantId: string,
  clientId: string
): Promise<Contact | null> {
  const client = await getClientById(tenantId, clientId);
  if (!client) {
    return null;
  }

  const contacts = client.contacts || [];
  
  // First try to find explicit primary
  const primary = contacts.find(c => c.isPrimary);
  if (primary) {
    return primary;
  }

  // Fall back to first contact
  return contacts[0] || null;
}
