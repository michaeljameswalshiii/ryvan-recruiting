/**
 * Authenticate MCP HTTP requests (API key + tenant header).
 * @serverOnly
 */

import { NextRequest, NextResponse } from "next/server";
import {
  extractApiKeyFromHeaders,
  extractTenantFromHeaders,
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
  const tenantId =
    extractTenantFromHeaders(request.headers) ||
    request.nextUrl.searchParams.get("tenantId");

  if (!apiKey) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Missing API key. Send Authorization: Bearer <key> or X-Trio-Api-Key.",
        },
        { status: 401 }
      ),
    };
  }
  if (!tenantId) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Missing tenant. Send X-Trio-Tenant-Id header (shown when the key was created in Settings).",
        },
        { status: 401 }
      ),
    };
  }

  const auth = await validateMcpApiKey(tenantId, apiKey);
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
