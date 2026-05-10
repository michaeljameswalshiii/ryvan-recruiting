/**
 * Tenant Repository
 * Server-only data access layer for tenants
 * 
 * Features:
 * - Zod schema validation
 * - Caching layer
 * - Tenant isolation
 * - verifyUserTenant for ownership validation
 * 
 * @serverOnly
 */

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { z } from 'zod';
import { getCached, setCached, invalidateTenantCache, makeCacheKey } from '../../cache';

// ============================================================================
// Configuration
// ============================================================================

const region = process.env.AWS_REGION || 'us-east-1';
const tenantsTable = process.env.DYNAMODB_TENANTS_TABLE || 'turnkey-tenants';
const profilesTable = process.env.DYNAMODB_PROFILES_TABLE || 'turnkey-profiles';

// Cache TTL: 5 minutes
const CACHE_TTL = 300;

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Tenant schema for validation
 */
export const tenantSchema = z.object({
  id: z.string(),
  name: z.string(),
  subdomain: z.string(),
  created_at: z.string().optional(),
  modified_at: z.string().optional(),
});

export const createTenantSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  subdomain: z.string().min(1, 'Subdomain is required').max(50).transform(v => v.toLowerCase().replace(/\s+/g, '-')),
});

export const updateTenantSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  subdomain: z.string().min(1).max(50).optional(),
});

export const tenantQuerySchema = z.object({
  limit: z.coerce.number().max(100).optional(),
  cursor: z.string().optional(),
});

// Type exports
export type Tenant = z.infer<typeof tenantSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

// ============================================================================
// Client (singleton)
// ============================================================================

let _client: DynamoDBClient | null = null;

function getClient(): DynamoDBClient {
  if (!_client) {
    _client = new DynamoDBClient({ region });
  }
  return _client;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate tenant ID
 */
function generateTenantId(): string {
  return 'tenant-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
}

/**
 * Unmarshall DynamoDB item
 */
function unmarshallItem<T>(item: Record<string, any>): T {
  return unmarshall(item) as T;
}

// ============================================================================
// Repository Functions
// ============================================================================

/**
 * Get a tenant by ID
 * Includes caching
 */
export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  const cacheKey = makeCacheKey(tenantId, 'tenant', tenantId);
  
  // Try cache first
  const cached = await getCached<Tenant>(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Get from DynamoDB
  const client = getClient();
  const command = new GetItemCommand({
    TableName: tenantsTable,
    Key: marshall({ id: tenantId }),
  });
  
  const response = await client.send(command);
  
  if (!response.Item) {
    return null;
  }
  
  const tenant = unmarshallItem<Tenant>(response.Item);
  
  // Cache the result
  await setCached(cacheKey, tenant, CACHE_TTL);
  
  return tenant;
}

/**
 * Get a tenant by subdomain
 * Unique lookup for custom domains
 */
export async function getTenantBySubdomain(subdomain: string): Promise<Tenant | null> {
  const cacheKey = makeCacheKey(subdomain, 'tenant', 'subdomain');
  
  // Try cache first
  const cached = await getCached<Tenant>(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Query by subdomain GSI
  const client = getClient();
  const command = new QueryCommand({
    TableName: tenantsTable,
    IndexName: 'subdomain-index',
    KeyConditionExpression: 'subdomain = :subdomain',
    ExpressionAttributeValues: marshall({ ':subdomain': subdomain.toLowerCase() }),
  });
  
  const response = await client.send(command);
  
  if (!response.Items || response.Items.length === 0) {
    return null;
  }
  
  const tenant = unmarshallItem<Tenant>(response.Items[0]);
  
  // Cache the result
  await setCached(cacheKey, tenant, CACHE_TTL);
  
  return tenant;
}

/**
 * Get all tenants (admin only)
 */
export async function getAllTenants(options?: {
  limit?: number;
  cursor?: string;
}): Promise<{ tenants: Tenant[]; nextCursor?: string }> {
  const client = getClient();
  
  const command = new QueryCommand({
    TableName: tenantsTable,
    Limit: options?.limit || 50,
    ExclusiveStartKey: options?.cursor ? marshall({ id: options.cursor }) : undefined,
  });
  
  const response = await client.send(command);
  
  const tenants = response.Items?.map(item => unmarshallItem<Tenant>(item)) || [];
  
  const nextCursor = response.LastEvaluatedKey 
    ? unmarshall(response.LastEvaluatedKey).id as string 
    : undefined;
  
  return { tenants, nextCursor };
}

/**
 * Create a new tenant
 */
export async function createTenant(data: CreateTenantInput): Promise<Tenant> {
  const validated = createTenantSchema.parse(data);
  
  const tenant: Tenant = {
    id: generateTenantId(),
    name: validated.name,
    subdomain: validated.subdomain,
    created_at: new Date().toISOString(),
  };
  
  // Save to DynamoDB
  const client = getClient();
  const command = new PutItemCommand({
    TableName: tenantsTable,
    Item: marshall(tenant),
  });
  
  await client.send(command);
  
  // Invalidate any cached tenants
  await invalidateTenantCache(tenant.id);
  
  return tenant;
}

/**
 * Update a tenant
 */
export async function updateTenant(
  tenantId: string,
  data: UpdateTenantInput
): Promise<Tenant | null> {
  const validated = updateTenantSchema.parse(data);
  
  // Build update expression
  const updates: string[] = [];
  const values: Record<string, any> = {};
  const names: Record<string, string> = {};
  
  if (validated.name !== undefined) {
    updates.push('#name = :name');
    values[':name'] = validated.name;
    names['#name'] = 'name';
  }
  if (validated.subdomain !== undefined) {
    updates.push('#subdomain = :subdomain');
    values[':subdomain'] = validated.subdomain.toLowerCase();
    names['#subdomain'] = 'subdomain';
  }
  
  if (updates.length === 0) {
    return getTenantById(tenantId);
  }
  
  // Always update modified_at
  updates.push('#modified_at = :modified_at');
  values[':modified_at'] = new Date().toISOString();
  names['#modified_at'] = 'modified_at';
  
  // Execute update
  const client = getClient();
  const command = new UpdateItemCommand({
    TableName: tenantsTable,
    Key: marshall({ id: tenantId }),
    UpdateExpression: `SET ${updates.join(', ')}`,
    ExpressionAttributeValues: marshall(values),
    ExpressionAttributeNames: names,
    ReturnValues: 'ALL_NEW',
  });
  
  const response = await client.send(command);
  
  if (!response.Attributes) {
    return null;
  }
  
  const updated = unmarshallItem<Tenant>(response.Attributes);
  
  // Invalidate cache
  await invalidateTenantCache(tenantId);
  
  return updated;
}

/**
 * Delete a tenant (admin only)
 */
export async function deleteTenant(tenantId: string): Promise<void> {
  const client = getClient();
  const command = new DeleteItemCommand({
    TableName: tenantsTable,
    Key: marshall({ id: tenantId }),
  });
  
  await client.send(command);
  
  // Invalidate cache
  await invalidateTenantCache(tenantId);
}

// ============================================================================
// Tenant Isolation & Ownership
// ============================================================================

/**
 * Verify user belongs to tenant
 * CRITICAL: This prevents unauthorized access to other tenants' data
 */
export async function verifyUserTenant(
  userId: string,
  tenantId: string
): Promise<boolean> {
  try {
    // Get user's profile to verify tenant ownership
    const client = getClient();
    const command = new GetItemCommand({
      TableName: profilesTable,
      Key: marshall({ id: userId }),
    });
    
    const response = await client.send(command);
    
    if (!response.Item) {
      return false;
    }
    
    const profile = unmarshall(response.Item);
    return profile.tenant_id === tenantId;
  } catch {
    return false;
  }
}

/**
 * Get tenant for a user
 */
export async function getTenantForUser(userId: string): Promise<Tenant | null> {
  try {
    // First get user's profile to find tenant_id
    const client = getClient();
    const profileCommand = new GetItemCommand({
      TableName: profilesTable,
      Key: marshall({ id: userId }),
    });
    
    const profileResponse = await client.send(profileCommand);
    
    if (!profileResponse.Item) {
      return null;
    }
    
    const profile = unmarshall(profileResponse.Item);
    const tenantId = profile.tenant_id;
    
    if (!tenantId) {
      return null;
    }
    
    // Then get the tenant
    return getTenantById(tenantId);
  } catch {
    return null;
  }
}
