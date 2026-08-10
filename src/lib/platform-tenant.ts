/**
 * Platform tenant — home org for all Site Admins.
 *
 * Model:
 * - Customer data lives in real company tenants (e.g. tenant-2024-001).
 * - Site Admins have profile.tenant_id = PLATFORM_TENANT_ID ("tenant-platform").
 * - On login, Site Admins get tenantScope = "all" and can switch into any
 *   customer tenant via the header dropdown (platform tenant is excluded).
 *
 * @serverOnly
 */

import {
  DynamoDBClient,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import {
  getTenantById,
  type Tenant,
} from "@/lib/db/repositories/tenant-repository";
import { isSiteAdmin, normalizeRole } from "@/lib/roles";

/** Fixed id for the internal platform tenant (not a customer org). */
export const PLATFORM_TENANT_ID = "tenant-platform";

export const PLATFORM_TENANT_NAME = "Platform";
export const PLATFORM_TENANT_SUBDOMAIN = "platform";

const region = process.env.AWS_REGION || "us-east-1";

function getTenantsTable(): string {
  return process.env.DYNAMODB_TENANTS_TABLE || "turnkey-tenants";
}

function getClient() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  return new DynamoDBClient({
    region,
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
  });
}

export function isPlatformTenantId(
  tenantId: string | null | undefined
): boolean {
  return String(tenantId || "").trim() === PLATFORM_TENANT_ID;
}

/** True if this role should live on the platform tenant. */
export function roleUsesPlatformHome(
  role: string | null | undefined
): boolean {
  return isSiteAdmin(role);
}

/**
 * Ensure the platform tenant row exists. Safe to call on every site-admin login.
 */
export async function ensurePlatformTenant(): Promise<Tenant> {
  const existing = await getTenantById(PLATFORM_TENANT_ID);
  if (existing) return existing;

  const now = new Date().toISOString();
  const tenant: Tenant & { kind?: string } = {
    id: PLATFORM_TENANT_ID,
    name: PLATFORM_TENANT_NAME,
    subdomain: PLATFORM_TENANT_SUBDOMAIN,
    created_at: now,
    updated_at: now,
    plan: "enterprise",
    seat_limit: 100,
    status: "active",
    kind: "platform",
  };

  try {
    await getClient().send(
      new PutItemCommand({
        TableName: getTenantsTable(),
        Item: marshall(tenant, { removeUndefinedValues: true }),
        ConditionExpression: "attribute_not_exists(id)",
      })
    );
  } catch (err: unknown) {
    // Concurrent create — re-read
    const again = await getTenantById(PLATFORM_TENANT_ID);
    if (again) return again;
    const message = err instanceof Error ? err.message : String(err);
    if (!/conditional/i.test(message)) {
      console.error("[ensurePlatformTenant]", err);
      throw err;
    }
  }

  return (await getTenantById(PLATFORM_TENANT_ID)) || tenant;
}

/**
 * Resolve the home tenant id that should be stored on the user profile / session.
 * Site admins → platform; everyone else → their real org tenant.
 */
export function resolveHomeTenantId(
  role: string | null | undefined,
  currentTenantId?: string | null
): string {
  if (roleUsesPlatformHome(role)) {
    return PLATFORM_TENANT_ID;
  }
  return String(currentTenantId || "").trim();
}

/**
 * Filter platform tenant out of operational pickers (work-as-company lists).
 */
export function excludePlatformTenants<T extends { id?: string }>(
  tenants: T[]
): T[] {
  return (tenants || []).filter((t) => !isPlatformTenantId(t.id));
}

/**
 * Normalize a role string and return whether login should force All Tenants scope.
 */
export function siteAdminDefaultScope(
  role: string | null | undefined
): "all" | undefined {
  return isSiteAdmin(normalizeRole(role)) ? "all" : undefined;
}
