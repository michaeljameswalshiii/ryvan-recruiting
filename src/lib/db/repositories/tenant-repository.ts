/**
 * Tenant Repository
 * 
 * Full CRUD for tenants with caching and tenant isolation.
 * Uses DynamoDB with tenant_id as partition key.
 * 
 * @serverOnly
 */

import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand, DeleteItemCommand, QueryCommand, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall, marshall } from "@aws-sdk/util-dynamodb";
import { z } from "zod";
import { getCached, setCached, invalidateCache } from "@/lib/cache";

// ============================================================================
// Types
// ============================================================================

export interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  created_at: string;
  updated_at?: string;
}

export interface CreateTenantInput {
  name: string;
  subdomain: string;
}

export interface UpdateTenantInput {
  name?: string;
  subdomain?: string;
}

// ============================================================================
// Schema Validation
// ============================================================================

export const tenantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  subdomain: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  created_at: z.string(),
  updated_at: z.string().optional(),
});

export const createTenantSchema = z.object({
  name: z.string().min(1).max(100),
  subdomain: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and dashes"),
});

export const updateTenantSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  subdomain: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/).optional(),
});

// ============================================================================
// DynamoDB Client
// ============================================================================

const region = process.env.AWS_REGION || "us-east-1";
const dynamoClient = new DynamoDBClient({ region });

function getTenantsTable(): string {
  return process.env.DYNAMODB_TENANTS_TABLE || "turnkey-tenants";
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Get a tenant by ID
 */
export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  const cacheKey = `tenant:${tenantId}`;
  
  // Check cache first
  const cached = await getCached<Tenant>(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const command = new GetItemCommand({
      TableName: getTenantsTable(),
      Key: { id: { S: tenantId } },
    });
    
    const response = await dynamoClient.send(command);
    
    if (!response.Item) {
      return null;
    }
    
    const tenant = unmarshall(response.Item) as Tenant;
    
    // Cache for 5 minutes
    await setCached(cacheKey, tenant, 300);
    
    return tenant;
  } catch (error) {
    console.error("getTenantById error:", error);
    return null;
  }
}

/**
 * Get a tenant by subdomain
 */
export async function getTenantBySubdomain(subdomain: string): Promise<Tenant | null> {
  const cacheKey = `tenant:subdomain:${subdomain}`;
  
  // Check cache first
  const cached = await getCached<Tenant>(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const command = new QueryCommand({
      TableName: getTenantsTable(),
      IndexName: "subdomain-index",
      KeyConditionExpression: "subdomain = :subdomain",
      ExpressionAttributeValues: {
        ":subdomain": { S: subdomain.toLowerCase() },
      },
    });
    
    const response = await dynamoClient.send(command);
    
    if (!response.Items?.length) {
      return null;
    }
    
    const tenant = unmarshall(response.Items[0]) as Tenant;
    
    // Cache for 5 minutes
    await setCached(cacheKey, tenant, 300);
    
    return tenant;
  } catch (error) {
    console.error("getTenantBySubdomain error:", error);
    return null;
  }
}

/**
 * Get all tenants (admin only)
 */
export async function getAllTenants(): Promise<Tenant[]> {
  try {
    const command = new ScanCommand({
      TableName: getTenantsTable(),
    });
    
    const response = await dynamoClient.send(command);
    
    if (!response.Items) {
      return [];
    }
    
    return response.Items.map(item => unmarshall(item) as Tenant);
  } catch (error) {
    console.error("getAllTenants error:", error);
    return [];
  }
}

/**
 * Create a new tenant
 */
export async function createTenant(input: CreateTenantInput): Promise<Tenant> {
  const validated = createTenantSchema.parse(input);
  
  const tenant: Tenant = {
    id: `tenant-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    name: validated.name,
    subdomain: validated.subdomain.toLowerCase(),
    created_at: new Date().toISOString(),
  };
  
  try {
    const command = new PutItemCommand({
      TableName: getTenantsTable(),
      Item: marshall(tenant),
    });
    
    await dynamoClient.send(command);
    
    return tenant;
  } catch (error) {
    console.error("createTenant error:", error);
    throw new Error("Failed to create tenant");
  }
}

/**
 * Update a tenant
 */
export async function updateTenant(tenantId: string, input: UpdateTenantInput): Promise<Tenant | null> {
  const validated = updateTenantSchema.parse(input);
  
  // Build update expression
  const updates: string[] = [];
  const values: Record<string, unknown> = {};
  const names: Record<string, string> = {};
  
  if (validated.name) {
    updates.push("#name = :name");
    values[":name"] = validated.name;
    names["#name"] = "name";
  }
  
  if (validated.subdomain) {
    updates.push("subdomain = :subdomain");
    values[":subdomain"] = validated.subdomain.toLowerCase();
  }
  
  if (updates.length === 0) {
    return getTenantById(tenantId);
  }
  
  updates.push("updated_at = :updated_at");
  values[":updated_at"] = new Date().toISOString();
  
  try {
    const command = new UpdateItemCommand({
      TableName: getTenantsTable(),
      Key: { id: { S: tenantId } },
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
    await invalidateCache(`tenant:${tenantId}*`);
    
    return unmarshall(response.Attributes) as Tenant;
  } catch (error) {
    console.error("updateTenant error:", error);
    return null;
  }
}

/**
 * Delete a tenant
 */
export async function deleteTenant(tenantId: string): Promise<boolean> {
  try {
    const command = new DeleteItemCommand({
      TableName: getTenantsTable(),
      Key: { id: { S: tenantId } },
      ReturnValues: "ALL_OLD",
    });
    
    const response = await dynamoClient.send(command);
    
    if (!response.Attributes) {
      return false;
    }
    
    // Invalidate cache
    await invalidateCache(`tenant:${tenantId}*`);
    
    return true;
  } catch (error) {
    console.error("deleteTenant error:", error);
    return false;
  }
}

/**
 * Verify user belongs to tenant (via profile)
 */
export async function verifyUserTenant(userId: string, tenantId: string): Promise<boolean> {
  try {
    const { getProfileById } = await import("./profile-repository");
    const profile = await getProfileById(userId);
    
    if (!profile) {
      return false;
    }
    
    return profile.tenant_id === tenantId;
  } catch (error) {
    console.error("verifyUserTenant error:", error);
    return false;
  }
}
