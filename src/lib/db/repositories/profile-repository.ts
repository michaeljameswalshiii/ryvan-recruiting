/**
 * Profile Repository
 * Server-only data access layer for user profiles
 * 
 * Features:
 * - Zod schema validation
 * - Caching layer
 * - Tenant isolation
 * - getProfileByEmail for auth lookups
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
const profilesTable = process.env.DYNAMODB_PROFILES_TABLE || 'turnkey-profiles';

// Cache TTL: 5 minutes
const CACHE_TTL = 300;

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Profile schema for validation
 */
export const profileSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  email: z.string().email(),
  full_name: z.string(),
  role: z.enum(['admin', 'member', 'viewer']),
  created_at: z.string().optional(),
  modified_at: z.string().optional(),
});

export const createProfileSchema = z.object({
  tenant_id: z.string().min(1, 'Tenant ID is required'),
  email: z.string().email('Invalid email'),
  full_name: z.string().min(1, 'Full name is required'),
  role: z.enum(['admin', 'member', 'viewer']).optional().default('member'),
});

export const updateProfileSchema = z.object({
  full_name: z.string().min(1).optional(),
  role: z.enum(['admin', 'member', 'viewer']).optional(),
});

// Type exports
export type Profile = z.infer<typeof profileSchema>;
export type CreateProfileInput = z.infer<typeof createProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

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
 * Generate user ID (UUID)
 */
function generateUserId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
 * Get a profile by user ID
 * Includes caching
 */
export async function getProfileById(userId: string): Promise<Profile | null> {
  const cacheKey = makeCacheKey(userId, 'profile', userId);
  
  // Try cache first
  const cached = await getCached<Profile>(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Get from DynamoDB
  const client = getClient();
  const command = new GetItemCommand({
    TableName: profilesTable,
    Key: marshall({ id: userId }),
  });
  
  const response = await client.send(command);
  
  if (!response.Item) {
    return null;
  }
  
  const profile = unmarshallItem<Profile>(response.Item);
  
  // Cache the result
  await setCached(cacheKey, profile, CACHE_TTL);
  
  return profile;
}

/**
 * Get all profiles for a tenant
 * Returns all team members
 */
export async function getAllProfiles(tenantId: string): Promise<Profile[]> {
  const cacheKey = makeCacheKey(tenantId, 'profiles', 'all');
  
  // Try cache first
  const cached = await getCached<Profile[]>(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Query from DynamoDB
  const client = getClient();
  const command = new QueryCommand({
    TableName: profilesTable,
    KeyConditionExpression: 'tenant_id = :tenantId',
    ExpressionAttributeValues: marshall({ ':tenantId': tenantId }),
  });
  
  const response = await client.send(command);
  
  const profiles = response.Items?.map(item => unmarshallItem<Profile>(item)) || [];
  
  // Cache the result
  await setCached(cacheKey, profiles, CACHE_TTL);
  
  return profiles;
}

/**
 * Get profile by email and tenant
 * Used for login/authentication
 */
export async function getProfileByEmail(
  tenantId: string,
  email: string
): Promise<Profile | null> {
  const cacheKey = makeCacheKey(tenantId, 'profile', `email:${email.toLowerCase()}`);
  
  // Try cache first
  const cached = await getCached<Profile>(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Query by email GSI
  const client = getClient();
  const command = new QueryCommand({
    TableName: profilesTable,
    IndexName: 'email-index',
    KeyConditionExpression: 'tenant_id = :tenantId AND email = :email',
    ExpressionAttributeValues: marshall({ 
      ':tenantId': tenantId, 
      ':email': email.toLowerCase() 
    }),
  });
  
  const response = await client.send(command);
  
  if (!response.Items || response.Items.length === 0) {
    return null;
  }
  
  const profile = unmarshallItem<Profile>(response.Items[0]);
  
  // Cache the result
  await setCached(cacheKey, profile, CACHE_TTL);
  
  return profile;
}

/**
 * Create a new profile
 * Used during user registration
 */
export async function createProfile(data: CreateProfileInput): Promise<Profile> {
  const validated = createProfileSchema.parse(data);
  
  const profile: Profile = {
    id: generateUserId(),
    tenant_id: validated.tenant_id,
    email: validated.email.toLowerCase(),
    full_name: validated.full_name,
    role: validated.role || 'member',
    created_at: new Date().toISOString(),
  };
  
  // Save to DynamoDB
  const client = getClient();
  const command = new PutItemCommand({
    TableName: profilesTable,
    Item: marshall(profile),
  });
  
  await client.send(command);
  
  // Invalidate tenant cache (new user added)
  await invalidateTenantCache(validated.tenant_id);
  
  return profile;
}

/**
 * Update a profile
 */
export async function updateProfile(
  userId: string,
  data: UpdateProfileInput
): Promise<Profile | null> {
  const validated = updateProfileSchema.parse(data);
  
  // First get existing to know tenant_id for cache
  const existing = await getProfileById(userId);
  if (!existing) {
    return null;
  }
  
  // Build update expression
  const updates: string[] = [];
  const values: Record<string, any> = {};
  const names: Record<string, string> = {};
  
  if (validated.full_name !== undefined) {
    updates.push('#full_name = :full_name');
    values[':full_name'] = validated.full_name;
    names['#full_name'] = 'full_name';
  }
  if (validated.role !== undefined) {
    updates.push('#role = :role');
    values[':role'] = validated.role;
    names['#role'] = 'role';
  }
  
  if (updates.length === 0) {
    return existing;
  }
  
  // Always update modified_at
  updates.push('#modified_at = :modified_at');
  values[':modified_at'] = new Date().toISOString();
  names['#modified_at'] = 'modified_at';
  
  // Execute update
  const client = getClient();
  const command = new UpdateItemCommand({
    TableName: profilesTable,
    Key: marshall({ id: userId }),
    UpdateExpression: `SET ${updates.join(', ')}`,
    ExpressionAttributeValues: marshall(values),
    ExpressionAttributeNames: names,
    ReturnValues: 'ALL_NEW',
  });
  
  const response = await client.send(command);
  
  if (!response.Attributes) {
    return null;
  }
  
  const updated = unmarshallItem<Profile>(response.Attributes);
  
  // Invalidate cache
  await invalidateTenantCache(existing.tenant_id);
  
  return updated;
}

/**
 * Delete a profile
 */
export async function deleteProfile(userId: string): Promise<void> {
  // First get existing to know tenant_id for cache
  const existing = await getProfileById(userId);
  
  const client = getClient();
  const command = new DeleteItemCommand({
    TableName: profilesTable,
    Key: marshall({ id: userId }),
  });
  
  await client.send(command);
  
  // Invalidate cache if we had the profile
  if (existing) {
    await invalidateTenantCache(existing.tenant_id);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if user is admin of tenant
 */
export async function isTenantAdmin(userId: string, tenantId: string): Promise<boolean> {
  const profile = await getProfileById(userId);
  return profile?.tenant_id === tenantId && profile?.role === 'admin';
}

/**
 * Get tenant ID for a user
 */
export async function getTenantIdForUser(userId: string): Promise<string | null> {
  const profile = await getProfileById(userId);
  return profile?.tenant_id || null;
}
