/**
 * Tenant-scoped MCP API keys for Claude Desktop/Code connections.
 * Plaintext key shown once at creation; only SHA-256 hash is stored.
 *
 * @serverOnly
 */

import { createHash, randomBytes } from "crypto";
import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { invalidateCache } from "@/lib/cache";

export type McpApiKeyRecord = {
  id: string;
  name: string;
  /** First 12 chars of key for display (e.g. trio_mcp_ab12…) */
  prefix: string;
  key_hash: string;
  created_at: string;
  created_by: string;
  last_used_at?: string;
  revoked_at?: string | null;
};

export type McpApiKeyPublic = Omit<McpApiKeyRecord, "key_hash">;

const region = process.env.AWS_REGION || "us-east-1";

function dynamo() {
  return new DynamoDBClient({
    region,
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });
}

function tenantsTable() {
  return process.env.DYNAMODB_TENANTS_TABLE || "turnkey-tenants";
}

export function hashMcpApiKey(raw: string): string {
  return createHash("sha256").update(raw.trim()).digest("hex");
}

/** Generate a new secret. Format: trio_mcp_<48 hex chars> */
export function generateMcpApiKey(): string {
  return `trio_mcp_${randomBytes(24).toString("hex")}`;
}

function toPublic(k: McpApiKeyRecord): McpApiKeyPublic {
  const { key_hash: _h, ...rest } = k;
  return rest;
}

async function loadTenantRaw(tenantId: string): Promise<Record<string, any> | null> {
  const res = await dynamo().send(
    new GetItemCommand({
      TableName: tenantsTable(),
      Key: { id: { S: tenantId } },
    })
  );
  if (!res.Item) return null;
  return unmarshall(res.Item) as Record<string, any>;
}

async function saveMcpKeys(tenantId: string, keys: McpApiKeyRecord[]): Promise<void> {
  await dynamo().send(
    new UpdateItemCommand({
      TableName: tenantsTable(),
      Key: { id: { S: tenantId } },
      UpdateExpression: "SET mcp_api_keys = :keys, updated_at = :u",
      ExpressionAttributeValues: marshall(
        {
          ":keys": keys,
          ":u": new Date().toISOString(),
        },
        { removeUndefinedValues: true }
      ),
    })
  );
  await invalidateCache(`tenant:${tenantId}`);
}

export async function listMcpApiKeys(tenantId: string): Promise<McpApiKeyPublic[]> {
  const tenant = await loadTenantRaw(tenantId);
  const keys = (tenant?.mcp_api_keys || []) as McpApiKeyRecord[];
  return keys
    .filter((k) => !k.revoked_at)
    .map(toPublic)
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
}

export async function createMcpApiKey(input: {
  tenantId: string;
  name: string;
  createdBy: string;
}): Promise<{ key: McpApiKeyPublic; plaintext: string }> {
  const tenant = await loadTenantRaw(input.tenantId);
  if (!tenant) throw new Error("Tenant not found");

  const plaintext = generateMcpApiKey();
  const record: McpApiKeyRecord = {
    id: `mcpkey_${randomBytes(8).toString("hex")}`,
    name: (input.name || "Claude MCP").trim().slice(0, 80),
    prefix: plaintext.slice(0, 16) + "…",
    key_hash: hashMcpApiKey(plaintext),
    created_at: new Date().toISOString(),
    created_by: input.createdBy,
    revoked_at: null,
  };

  const existing = (tenant.mcp_api_keys || []) as McpApiKeyRecord[];
  // Cap active keys
  const active = existing.filter((k) => !k.revoked_at);
  if (active.length >= 20) {
    throw new Error("Maximum of 20 active MCP API keys per organization");
  }

  await saveMcpKeys(input.tenantId, [...existing, record]);
  return { key: toPublic(record), plaintext };
}

export async function revokeMcpApiKey(
  tenantId: string,
  keyId: string
): Promise<boolean> {
  const tenant = await loadTenantRaw(tenantId);
  if (!tenant) return false;
  const existing = (tenant.mcp_api_keys || []) as McpApiKeyRecord[];
  let found = false;
  const next = existing.map((k) => {
    if (k.id === keyId && !k.revoked_at) {
      found = true;
      return { ...k, revoked_at: new Date().toISOString() };
    }
    return k;
  });
  if (!found) return false;
  await saveMcpKeys(tenantId, next);
  return true;
}

export type ValidatedMcpKey = {
  tenantId: string;
  keyId: string;
  keyName: string;
};

/**
 * Validate raw API key for a tenant. Updates last_used_at (best-effort).
 */
export async function validateMcpApiKey(
  tenantId: string,
  rawKey: string
): Promise<ValidatedMcpKey | null> {
  const key = rawKey.trim();
  if (!key.startsWith("trio_mcp_") && !isTestMcpKey(key)) return null;

  // Dev/test key: TRIO_MCP_TEST_KEY (+ optional TRIO_MCP_TEST_TENANT_ID)
  if (isTestMcpKey(key)) {
    const testTenant =
      (process.env.TRIO_MCP_TEST_TENANT_ID || "").trim() || tenantId;
    if (!testTenant) return null;
    if (tenantId && tenantId !== testTenant) return null;
    return {
      tenantId: testTenant,
      keyId: "mcpkey_test",
      keyName: "Test key (env)",
    };
  }

  const tenant = await loadTenantRaw(tenantId);
  if (!tenant) return null;

  const hash = hashMcpApiKey(key);
  const keys = (tenant.mcp_api_keys || []) as McpApiKeyRecord[];
  const match = keys.find((k) => k.key_hash === hash && !k.revoked_at);
  if (!match) return null;

  // Best-effort last_used_at (don't fail the request)
  try {
    const next = keys.map((k) =>
      k.id === match.id
        ? { ...k, last_used_at: new Date().toISOString() }
        : k
    );
    await saveMcpKeys(tenantId, next);
  } catch {
    /* ignore */
  }

  return {
    tenantId,
    keyId: match.id,
    keyName: match.name,
  };
}

function isTestMcpKey(raw: string): boolean {
  const expected = (process.env.TRIO_MCP_TEST_KEY || "").trim();
  return !!expected && raw.trim() === expected;
}

/**
 * Resolve API key without a pre-known tenant (Claude connector often only sends Bearer).
 * 1) TRIO_MCP_TEST_KEY + TRIO_MCP_TEST_TENANT_ID
 * 2) Scan tenants for matching key hash (fine for small multi-tenant deployments)
 */
export async function resolveMcpApiKey(
  rawKey: string
): Promise<ValidatedMcpKey | null> {
  const key = rawKey.trim();
  if (!key) return null;

  if (isTestMcpKey(key)) {
    const testTenant = (process.env.TRIO_MCP_TEST_TENANT_ID || "").trim();
    if (!testTenant) {
      console.warn(
        "[mcp] TRIO_MCP_TEST_KEY set but TRIO_MCP_TEST_TENANT_ID is missing"
      );
      return null;
    }
    return {
      tenantId: testTenant,
      keyId: "mcpkey_test",
      keyName: "Test key (env)",
    };
  }

  if (!key.startsWith("trio_mcp_")) return null;

  const hash = hashMcpApiKey(key);
  try {
    const { getAllTenants } = await import(
      "@/lib/db/repositories/tenant-repository"
    );
    const tenants = await getAllTenants({ includePlatform: true });
    for (const t of tenants || []) {
      const tid = String((t as any).id || "").trim();
      if (!tid) continue;
      const keys = ((t as any).mcp_api_keys || []) as McpApiKeyRecord[];
      const match = keys.find((k) => k.key_hash === hash && !k.revoked_at);
      if (match) {
        // Best-effort last_used
        try {
          const next = keys.map((k) =>
            k.id === match.id
              ? { ...k, last_used_at: new Date().toISOString() }
              : k
          );
          await saveMcpKeys(tid, next);
        } catch {
          /* ignore */
        }
        return {
          tenantId: tid,
          keyId: match.id,
          keyName: match.name,
        };
      }
    }
  } catch (err) {
    console.warn("[mcp] resolveMcpApiKey scan failed:", err);
  }
  return null;
}

/** Extract bearer / x-api-key from a request */
export function extractApiKeyFromHeaders(headers: Headers): string | null {
  const auth = headers.get("authorization") || headers.get("Authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return (
    headers.get("x-trio-api-key") ||
    headers.get("X-Trio-Api-Key") ||
    headers.get("x-api-key") ||
    null
  );
}

export function extractTenantFromHeaders(headers: Headers): string | null {
  return (
    headers.get("x-trio-tenant-id") ||
    headers.get("X-Trio-Tenant-Id") ||
    null
  );
}
