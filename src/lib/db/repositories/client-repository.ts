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
import { type Client, type CreateClientInput, type UpdateClientInput } from '../../schemas/client';

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
  const cacheKey = makeCacheKey(tenantId, 'clients', clientId);
  
  // Try cache first
  const cached = await getCached<Client>(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Get from DynamoDB
  const client = await getItem<Client>(clientsTable, {
    tenant_id: tenantId,
    id: clientId,
  });
  
  if (client) {
    await setCached(cacheKey, client, CACHE_TTL);
  }
  
  return client;
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
 * Get all clients for a tenant filtered by status (in-memory filter)
 * Note: Requires fetching all clients first, then filtering
 */
export async function getClientsByStatus(tenantId: string, status: string): Promise<Client[]> {
  const allClients = await getAllClients(tenantId);
  return allClients.filter(client => client.status === status);
}

/**
 * Update client status
 */
export async function updateClientStatus(
  tenantId: string,
  clientId: string,
  newStatus: string
): Promise<Client | null> {
  const updated = await updateItem<Client>(
    clientsTable,
    { tenant_id: tenantId, id: clientId },
    'SET #status = :status, #modified_at = :modified_at',
    { ':status': newStatus, ':modified_at': new Date().toISOString() },
    { '#status': 'status', '#modified_at': 'modified_at' }
  );
  
  // Invalidate cache
  await invalidateTenantCache(tenantId);
  
  return updated;
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
