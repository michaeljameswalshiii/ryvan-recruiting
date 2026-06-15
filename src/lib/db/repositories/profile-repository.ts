/**
 * Profile Repository
 * 
 * Full CRUD for user profiles with caching and tenant isolation.
 * Uses DynamoDB with id (userId) as partition key.
 * 
 * @serverOnly
 */

import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand, DeleteItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall, marshall } from "@aws-sdk/util-dynamodb";
import { z } from "zod";
import { getCached, setCached, invalidateCache } from "@/lib/cache";

// ============================================================================
// Types
// ============================================================================

export interface Profile {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
  updated_at?: string;
}

export interface CreateProfileInput {
  tenant_id: string;
  email: string;
  full_name: string;
  role?: string;
}

export interface UpdateProfileInput {
  full_name?: string;
  role?: string;
}

// ============================================================================
// Schema Validation
// ============================================================================

export const profileSchema = z.object({
  id: z.string().min(1),
  tenant_id: z.string().min(1),
  email: z.string().email(),
  full_name: z.string().min(1).max(100),
  role: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
});

export const createProfileSchema = z.object({
  tenant_id: z.string().min(1),
  email: z.string().email(),
  full_name: z.string().min(1).max(100),
  role: z.string().optional(),
});

export const updateProfileSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  role: z.string().optional(),
});

// ============================================================================
// DynamoDB Client
// ============================================================================

const region = process.env.AWS_REGION || "us-east-1";
const dynamoClient = new DynamoDBClient({ region });

function getProfilesTable(): string {
  return process.env.DYNAMODB_PROFILES_TABLE || "turnkey-profiles";
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Get a profile by ID (userId)
 */
export async function getProfileById(userId: string): Promise<Profile | null> {
  const cacheKey = `profile:${userId}`;
  
  // Check cache first
  const cached = await getCached<Profile>(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const command = new GetItemCommand({
      TableName: getProfilesTable(),
      Key: { id: { S: userId } },
    });
    
    const response = await dynamoClient.send(command);
    
    if (!response.Item) {
      return null;
    }
    
    const profile = unmarshall(response.Item) as Profile;
    
    // Cache for 5 minutes
    await setCached(cacheKey, profile, 300);
    
    return profile;
  } catch (error) {
    console.error("getProfileById error:", error);
    return null;
  }
}

/**
 * Get a profile by email
 */
export async function getProfileByEmail(email: string): Promise<Profile | null> {
  const cacheKey = `profile:email:${email.toLowerCase()}`;
  
  // Check cache first
  const cached = await getCached<Profile>(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const command = new QueryCommand({
      TableName: getProfilesTable(),
      IndexName: "email-index",
      KeyConditionExpression: "email = :email",
      ExpressionAttributeValues: {
        ":email": { S: email.toLowerCase() },
      },
    });
    
    const response = await dynamoClient.send(command);
    
    if (!response.Items?.length) {
      return null;
    }
    
    const profile = unmarshall(response.Items[0]) as Profile;
    
    // Cache for 5 minutes
    await setCached(cacheKey, profile, 300);
    
    return profile;
  } catch (error) {
    console.error("getProfileByEmail error:", error);
    return null;
  }
}

/**
 * Get all profiles for a tenant
 */
export async function getProfilesByTenant(tenantId: string): Promise<Profile[]> {
  const cacheKey = `profiles:tenant:${tenantId}`;
  
  // Check cache first
  const cached = await getCached<Profile[]>(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const command = new QueryCommand({
      TableName: getProfilesTable(),
      IndexName: "tenant-index",
      KeyConditionExpression: "tenant_id = :tenant_id",
      ExpressionAttributeValues: {
        ":tenant_id": { S: tenantId },
      },
    });
    
    const response = await dynamoClient.send(command);
    
    if (!response.Items) {
      return [];
    }
    
    const profiles = response.Items.map(item => unmarshall(item) as Profile);
    
    // Cache for 5 minutes
    await setCached(cacheKey, profiles, 300);
    
    return profiles;
  } catch (error) {
    console.error("getProfilesByTenant error:", error);
    return [];
  }
}

/**
 * Create a new profile
 */
export async function createProfile(input: CreateProfileInput): Promise<Profile> {
  const validated = createProfileSchema.parse(input);
  
  const profile: Profile = {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    tenant_id: validated.tenant_id,
    email: validated.email.toLowerCase(),
    full_name: validated.full_name,
    role: validated.role || "user",
    created_at: new Date().toISOString(),
  };
  
  try {
    const command = new PutItemCommand({
      TableName: getProfilesTable(),
      Item: marshall(profile),
    });
    
    await dynamoClient.send(command);
    
    return profile;
  } catch (error) {
    console.error("createProfile error:", error);
    throw new Error("Failed to create profile");
  }
}

/**
 * Update a profile
 */
export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<Profile | null> {
  const validated = updateProfileSchema.parse(input);
  
  // Build update expression
  const updates: string[] = [];
  const values: Record<string, unknown> = {};
  const names: Record<string, string> = {};
  
  if (validated.full_name) {
    updates.push("#full_name = :full_name");
    values[":full_name"] = validated.full_name;
    names["#full_name"] = "full_name";
  }
  
  if (validated.role) {
    updates.push("#role = :role");
    values[":role"] = validated.role;
    names["#role"] = "role";
  }
  
  if (updates.length === 0) {
    return getProfileById(userId);
  }
  
  updates.push("updated_at = :updated_at");
  values[":updated_at"] = new Date().toISOString();
  
  try {
    const command = new UpdateItemCommand({
      TableName: getProfilesTable(),
      Key: { id: { S: userId } },
      UpdateExpression: `SET ${updates.join(", ")}`,
      ExpressionAttributeValues: marshall(values),
      ExpressionAttributeNames: names,
      ReturnValues: "ALL_NEW",
    });
    
    const response = await dynamoClient.send(command);
    
    if (!response.Attributes) {
      return null;
    }
    
    // Invalidate cache
    await invalidateCache(`profile:${userId}*`);
    await invalidateCache(`profiles:tenant:*`);
    
    return unmarshall(response.Attributes) as Profile;
  } catch (error) {
    console.error("updateProfile error:", error);
    return null;
  }
}

/**
 * Delete a profile
 */
export async function deleteProfile(userId: string): Promise<boolean> {
  try {
    const command = new DeleteItemCommand({
      TableName: getProfilesTable(),
      Key: { id: { S: userId } },
      ReturnValues: "ALL_OLD",
    });
    
    const response = await dynamoClient.send(command);
    
    if (!response.Attributes) {
      return false;
    }
    
    // Invalidate cache
    await invalidateCache(`profile:${userId}*`);
    await invalidateCache(`profiles:tenant:*`);
    
    return true;
  } catch (error) {
    console.error("deleteProfile error:", error);
    return false;
  }
}

/**
 * Verify user belongs to tenant
 */
export async function verifyUserTenant(userId: string, tenantId: string): Promise<boolean> {
  const profile = await getProfileById(userId);
  
  if (!profile) {
    return false;
  }
  
  return profile.tenant_id === tenantId;
}
