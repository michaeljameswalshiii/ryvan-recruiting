/**
 * Tenant Repository
 * @serverOnly
 */

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { unmarshall, marshall } from "@aws-sdk/util-dynamodb";
import { z } from "zod";
import { getCached, setCached, invalidateCache } from "@/lib/cache";
import {
  defaultSeatLimit,
  normalizePlanId,
  normalizeTenantStatus,
  type PlanId,
  type TenantStatus,
} from "@/lib/plans";
import type { Tenant as SchemaTenant } from "@/lib/schemas/tenant";

export type Tenant = SchemaTenant;

export interface CreateTenantInput {
  name: string;
  subdomain: string;
}

export interface UpdateTenantInput {
  name?: string;
  subdomain?: string;
  logo_url?: string;
  primary_color?: string;
  careers_tagline?: string;
  billing_email?: string;
  plan?: PlanId | string;
  seat_limit?: number;
  status?: TenantStatus | string;
  trial_ends_at?: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  /** Enterprise security block (MFA policy, SSO flags) */
  security?: Record<string, unknown>;
  /** Default ownership for new records (creator vs fixed user) */
  ownership?: Record<string, unknown>;
}

export const createTenantSchema = z.object({
  name: z.string().min(1).max(100),
  subdomain: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and dashes"),
});

const region = process.env.AWS_REGION || "us-east-1";
const dynamoClient = new DynamoDBClient({
  region,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

function getTenantsTable(): string {
  return process.env.DYNAMODB_TENANTS_TABLE || "turnkey-tenants";
}

/** Normalize tenant with plan defaults for API responses */
export function withPlanDefaults(tenant: Tenant): Tenant & {
  plan: PlanId;
  seat_limit: number;
  status: TenantStatus;
} {
  const plan = normalizePlanId(tenant.plan);
  const seat_limit =
    typeof tenant.seat_limit === "number" && tenant.seat_limit > 0
      ? tenant.seat_limit
      : defaultSeatLimit(plan);
  return {
    ...tenant,
    plan,
    seat_limit,
    status: normalizeTenantStatus(tenant.status),
  };
}

export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  const cacheKey = `tenant:${tenantId}`;
  const cached = await getCached<Tenant>(cacheKey);
  if (cached) return cached;

  try {
    const command = new GetItemCommand({
      TableName: getTenantsTable(),
      Key: { id: { S: tenantId } },
    });
    const response = await dynamoClient.send(command);
    if (!response.Item) return null;
    const tenant = unmarshall(response.Item) as Tenant;
    await setCached(cacheKey, tenant, 300);
    return tenant;
  } catch (error) {
    console.error("getTenantById error:", error);
    return null;
  }
}

export async function getTenantBySubdomain(
  subdomain: string
): Promise<Tenant | null> {
  const slug = subdomain.trim().toLowerCase();
  if (!slug) return null;

  const cacheKey = `tenant:subdomain:${slug}`;
  const cached = await getCached<Tenant>(cacheKey);
  if (cached) return cached;

  const preferred = (process.env.CAREERS_PREFERRED_TENANT_ID || "").trim();

  try {
    // Prefer GSI if present; fallback scan
    try {
      const { QueryCommand } = await import("@aws-sdk/client-dynamodb");
      const q = await dynamoClient.send(
        new QueryCommand({
          TableName: getTenantsTable(),
          IndexName: "subdomain-index",
          KeyConditionExpression: "subdomain = :s",
          ExpressionAttributeValues: { ":s": { S: slug } },
        })
      );
      if (q.Items?.length) {
        let matches = q.Items.map((i) => unmarshall(i) as Tenant);
        let tenant = matches[0];
        if (preferred && matches.some((t) => t.id === preferred)) {
          tenant = matches.find((t) => t.id === preferred)!;
        }
        await setCached(cacheKey, tenant, 300);
        return tenant;
      }
    } catch {
      // GSI may not exist
    }

    const scan = await dynamoClient.send(
      new ScanCommand({
        TableName: getTenantsTable(),
        FilterExpression: "subdomain = :s",
        ExpressionAttributeValues: { ":s": { S: slug } },
      })
    );
    const matches = (scan.Items || []).map((i) => unmarshall(i) as Tenant);
    if (!matches.length) return null;
    let tenant = matches[0];
    if (preferred && matches.some((t) => t.id === preferred)) {
      tenant = matches.find((t) => t.id === preferred)!;
    }
    await setCached(cacheKey, tenant, 300);
    return tenant;
  } catch (error) {
    console.error("getTenantBySubdomain error:", error);
    return null;
  }
}

export async function getAllTenants(opts?: {
  /** Include internal platform tenant (default false for operational lists) */
  includePlatform?: boolean;
}): Promise<Tenant[]> {
  try {
    const command = new ScanCommand({ TableName: getTenantsTable() });
    const response = await dynamoClient.send(command);
    if (!response.Items) return [];
    let tenants = response.Items.map((item) => unmarshall(item) as Tenant);
    if (!opts?.includePlatform) {
      const { PLATFORM_TENANT_ID } = await import("@/lib/platform-tenant");
      tenants = tenants.filter((t) => t.id !== PLATFORM_TENANT_ID);
    }
    return tenants;
  } catch (error) {
    console.error("getAllTenants error:", error);
    return [];
  }
}

export async function createTenant(
  input: CreateTenantInput
): Promise<Tenant> {
  const validated = createTenantSchema.parse(input);
  const tenant: Tenant = {
    id: `tenant-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    name: validated.name,
    subdomain: validated.subdomain.toLowerCase(),
    created_at: new Date().toISOString(),
    plan: "free",
    seat_limit: defaultSeatLimit("free"),
    status: "trial",
  };

  try {
    await dynamoClient.send(
      new PutItemCommand({
        TableName: getTenantsTable(),
        Item: marshall(tenant, { removeUndefinedValues: true }),
      })
    );
    return tenant;
  } catch (error) {
    console.error("createTenant error:", error);
    throw new Error("Failed to create tenant");
  }
}

export async function updateTenant(
  tenantId: string,
  input: UpdateTenantInput
): Promise<Tenant | null> {
  const updates: string[] = [];
  const values: Record<string, unknown> = {};
  const names: Record<string, string> = {};

  const setField = (attr: string, value: unknown, reserved = false) => {
    if (value === undefined) return;
    // Store empty strings as empty (avoid DynamoDB NULL marshall issues)
    const v = value === "" ? "" : value;
    if (reserved) {
      names[`#${attr}`] = attr;
      updates.push(`#${attr} = :${attr}`);
    } else {
      updates.push(`${attr} = :${attr}`);
    }
    values[`:${attr}`] = v;
  };

  setField("name", input.name, true);
  if (input.subdomain !== undefined) {
    updates.push("subdomain = :subdomain");
    values[":subdomain"] = input.subdomain.toLowerCase();
  }
  setField("logo_url", input.logo_url);
  setField("primary_color", input.primary_color);
  setField("careers_tagline", input.careers_tagline);
  setField("billing_email", input.billing_email);
  if (input.plan !== undefined) {
    updates.push("plan = :plan");
    values[":plan"] = normalizePlanId(input.plan);
  }
  if (input.seat_limit !== undefined) {
    updates.push("seat_limit = :seat_limit");
    values[":seat_limit"] = input.seat_limit;
  }
  if (input.status !== undefined) {
    names["#status"] = "status";
    updates.push("#status = :status");
    values[":status"] = normalizeTenantStatus(input.status);
  }
  setField("trial_ends_at", input.trial_ends_at);
  setField("stripe_customer_id", input.stripe_customer_id);
  setField("stripe_subscription_id", input.stripe_subscription_id);
  if (input.security !== undefined) {
    updates.push("security = :security");
    values[":security"] = input.security;
  }
  if (input.ownership !== undefined) {
    updates.push("ownership = :ownership");
    values[":ownership"] = input.ownership;
  }
  if ((input as any).product_config !== undefined) {
    updates.push("product_config = :product_config");
    values[":product_config"] = (input as any).product_config;
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
      ExpressionAttributeValues: marshall(values, {
        removeUndefinedValues: true,
      }),
      ...(Object.keys(names).length
        ? { ExpressionAttributeNames: names }
        : {}),
      ReturnValues: "ALL_NEW",
    });

    const response = await dynamoClient.send(command);
    if (!response.Attributes) return null;

    await invalidateCache(`tenant:${tenantId}`);
    const tenant = unmarshall(response.Attributes) as Tenant;
    if (tenant.subdomain) {
      await invalidateCache(`tenant:subdomain:${tenant.subdomain}`);
    }
    return tenant;
  } catch (error) {
    console.error("updateTenant error:", error);
    return null;
  }
}

export async function deleteTenant(tenantId: string): Promise<boolean> {
  try {
    const response = await dynamoClient.send(
      new DeleteItemCommand({
        TableName: getTenantsTable(),
        Key: { id: { S: tenantId } },
        ReturnValues: "ALL_OLD",
      })
    );
    if (!response.Attributes) return false;
    await invalidateCache(`tenant:${tenantId}`);
    return true;
  } catch (error) {
    console.error("deleteTenant error:", error);
    return false;
  }
}

export async function verifyUserTenant(
  userId: string,
  tenantId: string
): Promise<boolean> {
  try {
    const { getProfileById } = await import("./profile-repository");
    const profile = await getProfileById(userId);
    return !!profile && profile.tenant_id === tenantId;
  } catch (error) {
    console.error("verifyUserTenant error:", error);
    return false;
  }
}
