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
 */
export async function getClientByIdAction(clientId: string) {
  const tenantId = await getSessionTenantId();
  
  if (!tenantId) {
    return { error: 'Unauthorized' };
  }

  try {
    const client = await getClientById(tenantId, clientId);
    return { client };
  } catch (error: any) {
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
  const tenantId = await getSessionTenantId();
  
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
  const tenantId = await getSessionTenantId();
  
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
  const tenantId = await getSessionTenantId();
  
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
