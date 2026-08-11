/**
 * Authenticate MCP HTTP requests (API key; tenant optional when key resolves it).
 * @serverOnly
 */

import { NextRequest, NextResponse } from "next/server";
import {
  extractApiKeyFromHeaders,
  extractTenantFromHeaders,
  resolveMcpApiKey,
  validateMcpApiKey,
  type ValidatedMcpKey,
} from "@/lib/mcp/api-keys";

export async function requireMcpHttpAuth(
  request: NextRequest
): Promise<
  | { ok: true; auth: ValidatedMcpKey }
  | { ok: false; response: NextResponse }
> {
  const apiKey = extractApiKeyFromHeaders(request.headers);
  const headerTenant =
    extractTenantFromHeaders(request.headers) ||
    request.nextUrl.searchParams.get("tenantId") ||
    "";

  if (!apiKey) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Missing API key. Send Authorization: Bearer <key> (or X-Trio-Api-Key).",
        },
        { status: 401 }
      ),
    };
  }

  // Prefer explicit tenant + key (fast path)
  if (headerTenant.trim()) {
    const auth = await validateMcpApiKey(headerTenant.trim(), apiKey);
    if (!auth) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Invalid or revoked MCP API key for this tenant" },
          { status: 401 }
        ),
      };
    }
    return { ok: true, auth };
  }

  // Claude connector path: Bearer only → resolve tenant from key
  const resolved = await resolveMcpApiKey(apiKey);
  if (!resolved) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Invalid API key, or key could not be resolved to a tenant. Create a key in Company Settings → MCP, or set TRIO_MCP_TEST_KEY + TRIO_MCP_TEST_TENANT_ID. Optionally send X-Trio-Tenant-Id.",
        },
        { status: 401 }
      ),
    };
  }

  return { ok: true, auth: resolved };
}
