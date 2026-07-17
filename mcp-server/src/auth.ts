/**
 * MCP process auth: API key + tenant binding via environment.
 *
 * Claude Desktop/Code launches this process with env vars; we validate once at startup.
 * TRIO_MCP_API_KEY must match a configured key; TRIO_TENANT_ID scopes all DynamoDB access.
 */

export type McpAuthContext = {
  apiKey: string;
  tenantId: string;
  /** Optional display label for logs */
  label?: string;
};

function parseKeyMap(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw?.trim()) return out;
  // Format: key1:tenant-id-1,key2:tenant-id-2
  for (const part of raw.split(",")) {
    const idx = part.indexOf(":");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const tenant = part.slice(idx + 1).trim();
    if (key && tenant) out[key] = tenant;
  }
  return out;
}

/**
 * Resolve auth from env. Throws if misconfigured (MCP must not start open).
 */
export function requireMcpAuth(): McpAuthContext {
  const apiKey = (process.env.TRIO_MCP_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error(
      "TRIO_MCP_API_KEY is required. Set it in Claude Desktop/Code MCP env config."
    );
  }

  // Multi-key map takes precedence when present
  const keyMap = parseKeyMap(process.env.TRIO_MCP_API_KEYS);
  if (Object.keys(keyMap).length > 0) {
    const tenantId = keyMap[apiKey];
    if (!tenantId) {
      throw new Error(
        "TRIO_MCP_API_KEY is not authorized (not found in TRIO_MCP_API_KEYS map)."
      );
    }
    return { apiKey, tenantId, label: "mapped-key" };
  }

  // Single-tenant mode: key + explicit tenant
  const expectedKey = (process.env.TRIO_MCP_EXPECTED_API_KEY || "").trim();
  if (expectedKey && apiKey !== expectedKey) {
    throw new Error("TRIO_MCP_API_KEY does not match TRIO_MCP_EXPECTED_API_KEY.");
  }

  const tenantId = (process.env.TRIO_TENANT_ID || "").trim();
  if (!tenantId) {
    throw new Error(
      "TRIO_TENANT_ID is required (or use TRIO_MCP_API_KEYS=key:tenantId map)."
    );
  }

  return { apiKey, tenantId, label: "single-tenant" };
}

/** Mask key for stderr logs */
export function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
