/**
 * Client Server Actions
 * Server-side CRUD operations for clients using httpOnly cookies
 * 
 * @serverOnly
 */

'use server';

import { getSessionTenantId, getSessionUserId } from '../server-auth';
import { getAllClients, createClient as createClientRepo, getClientById, updateClient, deleteClient } from '../db/repositories/client-repository';
import { createClientSchema, updateClientSchema } from '../schemas/client';

/**
 * Get all clients for the current tenant
 */
export async function getClients() {
  let tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();

  // If no tenantId but user is logged in, use default tenant
  if (!tenantId && userId) {
    tenantId = `tenant-${userId}`;
  }

  if (!tenantId) {
    // Not logged in - return empty array (not an error)
    return { clients: [] };
  }

  try {
    const clients = await getAllClients(tenantId);
    return { clients };
  } catch (error: any) {
    return { error: error.message || 'Failed to get clients' };
  }
}

/**
 * Get a single client by ID
 * Tries multiple tenant formats to find the client (handles legacy data migration)
 */
export async function getClientByIdAction(clientId: string) {
  let tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  
  console.log('[getClientByIdAction] Request for clientId:', clientId, 'tenantId:', tenantId, 'userId:', userId);
  
  // Collect all potential tenant IDs to try
  const tenantsToTry: string[] = [];
  
  // Add current tenant if available
  if (tenantId) {
    tenantsToTry.push(tenantId);
  }
  
  // Add userId-based tenant
  if (userId) {
    const userTenant = `tenant-${userId}`;
    if (!tenantsToTry.includes(userTenant)) {
      tenantsToTry.push(userTenant);
    }
    // Also try without "tenant-" prefix (some legacy data)
    if (!tenantsToTry.includes(userId)) {
      tenantsToTry.push(userId);
    }
  }
  
  // Add legacy/default tenants
  if (!tenantsToTry.includes('default')) {
    tenantsToTry.push('default');
  }
  if (!tenantsToTry.includes('')) {
    tenantsToTry.push('');
  }
  
  // Remove duplicates and empty/null
  const uniqueTenants = [...new Set(tenantsToTry)].filter(Boolean);
  
  console.log('[getClientByIdAction] Trying tenants:', uniqueTenants);
  
  if (uniqueTenants.length === 0) {
    console.log('[getClientByIdAction] No tenantId or userId - returning Unauthorized');
    return { error: 'Unauthorized' };
  }

  try {
    // Try each tenant until we find the client
    let client = null;
    for (const tenant of uniqueTenants) {
      console.log('[getClientByIdAction] Trying tenant:', tenant);
      client = await getClientById(tenant, clientId);
      if (client) {
        console.log('[getClientByIdAction] Client found in tenant:', tenant);
        break;
      }
    }
    
    if (!client) {
      console.log('[getClientByIdAction] Client not found after trying all tenants:', { tenants: uniqueTenants, clientId });
      return { error: 'Client not found', client: null };
    }
    
    console.log('[getClientByIdAction] Client found:', client.name, 'tenant:', client.tenant_id);
    return { client };
  } catch (error: any) {
    console.error('[getClientByIdAction] Error:', error);
    return { error: error.message || 'Failed to get client' };
  }
}

/**
 * Create a new client
 */
export async function createClient(formData: FormData) {
  let tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  
  if (!userId) {
    return { error: 'Unauthorized' };
  }

  // If no tenantId but user is logged in, create/use default tenant
  if (!tenantId) {
    console.log('[createClient] No tenantId for user, creating default tenant');
    tenantId = `tenant-${userId}`;
  }

const rawData = {
    name: formData.get('name') as string,
    email: formData.get('email') as string || '',
    phone: formData.get('phone') as string || '',
    company: formData.get('company') as string || '',
    domain: formData.get('domain') as string || '',
    industry: formData.get('industry') as string || '',
    city: formData.get('city') as string || '',
    state: formData.get('state') as string || '',
    country: formData.get('country') as string || '',
    employee_count: formData.get('employee_count') && formData.get('employee_count') !== '' 
      ? Number(formData.get('employee_count')) 
      : undefined,
    revenue: formData.get('revenue') as string || '',
    description: formData.get('description') as string || '',
  };

  console.log('[createClient] rawData:', JSON.stringify(rawData));

const validated = createClientSchema.safeParse(rawData);
  
  if (!validated.success) {
    console.log('[createClient] Zod validation failed:', JSON.stringify(validated.error.flatten().fieldErrors));
    return {
      error: 'Invalid input',
      details: validated.error.flatten().fieldErrors,
    };
  }

  try {
    const client = await createClientRepo(tenantId, validated.data);
    return { success: true, client };
  } catch (error: any) {
    return { error: error.message || 'Failed to create client' };
  }
}

/**
 * Update an existing client
 */
export async function updateClientAction(clientId: string, formData: FormData) {
  let tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  
  // If no tenantId but user is logged in, use default tenant (same logic as createClient)
  if (!tenantId && userId) {
    tenantId = `tenant-${userId}`;
  }
  
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  const rawData = {
    name: formData.get('name') as string || undefined,
    email: formData.get('email') as string || undefined,
    phone: formData.get('phone') as string || undefined,
    company: formData.get('company') as string || undefined,
    domain: formData.get('domain') as string || undefined,
    industry: formData.get('industry') as string || undefined,
    city: formData.get('city') as string || undefined,
    state: formData.get('state') as string || undefined,
    country: formData.get('country') as string || undefined,
    employee_count: formData.get('employee_count') ? Number(formData.get('employee_count')) : undefined,
    revenue: formData.get('revenue') as string || undefined,
    description: formData.get('description') as string || undefined,
  };

  const validated = updateClientSchema.safeParse(rawData);
  
  if (!validated.success) {
    return {
      error: 'Invalid input',
      details: validated.error.flatten().fieldErrors,
    };
  }

  try {
    const client = await updateClient(tenantId, clientId, validated.data);
    return { success: true, client };
  } catch (error: any) {
    return { error: error.message || 'Failed to update client' };
  }
}

/**
 * Delete a client
 */
export async function deleteClientAction(clientId: string) {
  let tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  
  // If no tenantId but user is logged in, use default tenant (same logic as createClient)
  if (!tenantId && userId) {
    tenantId = `tenant-${userId}`;
  }
  
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  try {
    await deleteClient(tenantId, clientId);
    return { success: true };
  } catch (error: any) {
    return { error: error.message || 'Failed to delete client' };
  }
}

/**
 * Update client status (for pipeline movement)
 */
export async function updateClientStatusAction(clientId: string, status: string) {
  let tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  
  // If no tenantId but user is logged in, use default tenant (same logic as createClient)
  if (!tenantId && userId) {
    tenantId = `tenant-${userId}`;
  }
  
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  // Validate status is one of the allowed values
  const validStatuses = ['identification', 'outreach', 'conversation', 'presented', 'meeting', 'proposal', 'closed_won', 'lost'];
  if (!validStatuses.includes(status)) {
    return { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` };
  }

  try {
    const client = await updateClient(tenantId, clientId, { status: status as any });
    return { success: true, client };
  } catch (error: any) {
    return { error: error.message || 'Failed to update client status' };
  }
}

// ---------------------------------------------------------------------
// Contact Management Actions
// ---------------------------------------------------------------------

import { addContactToClient, updateClientContact, removeClientContact } from '../db/repositories/client-repository';
import { createContactSchema } from '../schemas/client';
import { recordContactAddedToCompany, recordContactUpdatedForCompany, recordContactRemovedFromCompany, recordPrimaryContactSetForCompany } from '../events/company-events';

/**
 * Add a contact to a client
 */
export async function addContactAction(clientId: string, contactData: {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
  notes?: string;
}) {
  const tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  
  if (!tenantId || !userId) {
    return { error: 'Unauthorized' };
  }

  const validated = createContactSchema.safeParse({
    ...contactData,
    isPrimary: contactData.isPrimary || false,
  });

  if (!validated.success) {
    return {
      error: 'Invalid input',
      details: validated.error.flatten().fieldErrors,
    };
  }

  try {
    const client = await addContactToClient(tenantId, clientId, validated.data);
    
    if (!client) {
      return { error: 'Client not found' };
    }

    // Record event
    await recordContactAddedToCompany(clientId, contactData.name, userId);
    
    if (contactData.isPrimary) {
      await recordPrimaryContactSetForCompany(clientId, contactData.name, userId);
    }

    return { success: true, client };
  } catch (error: any) {
    return { error: error.message || 'Failed to add contact' };
  }
}

/**
 * Update a contact on a client
 */
export async function updateContactAction(clientId: string, contactId: string, contactData: {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
  notes?: string;
}) {
  const tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  
  if (!tenantId || !userId) {
    return { error: 'Unauthorized' };
  }

  try {
    const client = await updateClientContact(tenantId, clientId, contactId, contactData);
    
    if (!client) {
      return { error: 'Client or contact not found' };
    }

    // Record event
    await recordContactUpdatedForCompany(clientId, contactData.name || 'Contact', 'details updated', userId);
    
    if (contactData.isPrimary) {
      await recordPrimaryContactSetForCompany(clientId, contactData.name || 'Contact', userId);
    }

    return { success: true, client };
  } catch (error: any) {
    return { error: error.message || 'Failed to update contact' };
  }
}

/**
 * Remove a contact from a client
 */
export async function removeContactAction(clientId: string, contactId: string, contactName: string = 'Contact') {
  const tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();
  
  if (!tenantId || !userId) {
    return { error: 'Unauthorized' };
  }

  try {
    const client = await removeClientContact(tenantId, clientId, contactId);
    
    if (!client) {
      return { error: 'Client or contact not found' };
    }

    // Record event
    await recordContactRemovedFromCompany(clientId, contactName, userId);

    return { success: true, client };
  } catch (error: any) {
    return { error: error.message || 'Failed to remove contact' };
  }
}
