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
 */
export async function getAllClients(tenantId: string): Promise<Client[]> {
  const cacheKey = makeCacheKey(tenantId, 'clients', 'all');
  
  // Try cache first
  const cached = await getCached<Client[]>(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Query from DynamoDB
  const clients = await queryItems<Client>(
    clientsTable,
    'tenant_id = :tenantId',
    { ':tenantId': tenantId }
  );
  
  // Cache the result
  await setCached(cacheKey, clients, CACHE_TTL);
  
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
  // Validate input (but don't require it - already validated by Zod at action level)
  const validated = data;
  
  const client: Client = {
    id: generateId(),
    tenant_id: tenantId,
    name: validated.name,
    email: validated.email || '',
    phone: validated.phone || '',
    company: validated.company || '',
    domain: validated.domain || '',
    industry: validated.industry || '',
    city: validated.city || '',
    state: validated.state || '',
    country: validated.country || '',
    employee_count: validated.employee_count,
    revenue: validated.revenue || '',
    description: validated.description || '',
    linkedin_url: validated.linkedin_url || '',
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
  
  if (updates.length === 0) {
    return getClientById(tenantId, clientId);
  }
  
  // Always update modified_at
  updates.push('#modified_at = :modified_at');
  values[':modified_at'] = new Date().toISOString();
  names['#modified_at'] = 'modified_at';
  
  const updated = await updateItem(
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
