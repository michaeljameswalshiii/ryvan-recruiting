/**
 * Authenticate MCP HTTP requests using OAuth access tokens or legacy API keys.
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  extractApiKeyFromHeaders,
  extractTenantFromHeaders,
  resolveMcpApiKey,
  validateMcpApiKey,
  type ValidatedMcpKey,
} from '@/lib/mcp/api-keys';
import { oauthAppUrl, validateMcpOAuthAccessToken } from '@/lib/mcp/oauth';

function unauthorized(message: string): NextResponse {
  return NextResponse.json(
    { error: message },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': `Bearer resource_metadata="${oauthAppUrl()}/.well-known/oauth-protected-resource", scope="mcp"`,
      },
    }
  );
}

export async function requireMcpHttpAuth(
  request: NextRequest
): Promise<
  | { ok: true; auth: ValidatedMcpKey }
  | { ok: false; response: NextResponse }
> {
  const bearer = extractApiKeyFromHeaders(request.headers);
  const headerTenant =
    extractTenantFromHeaders(request.headers) ||
    request.nextUrl.searchParams.get('tenantId') ||
    '';

  if (!bearer) {
    return {
      ok: false,
      response: unauthorized('Missing bearer token. Use OAuth or send an MCP API key.'),
    };
  }

  // OAuth tokens are short-lived, audience-bound, and already contain tenant context.
  if (!bearer.startsWith('trio_mcp_')) {
    const oauth = await validateMcpOAuthAccessToken(bearer);
    if (oauth && (!headerTenant.trim() || oauth.tenantId === headerTenant.trim())) {
      return { ok: true, auth: oauth };
    }
    return {
      ok: false,
      response: unauthorized('Invalid, expired, or revoked OAuth access token'),
    };
  }

  if (headerTenant.trim()) {
    const auth = await validateMcpApiKey(headerTenant.trim(), bearer);
    if (!auth) {
      return {
        ok: false,
        response: unauthorized('Invalid or revoked MCP API key for this tenant'),
      };
    }
    return { ok: true, auth };
  }

  const resolved = await resolveMcpApiKey(bearer);
  if (!resolved) {
    return {
      ok: false,
      response: unauthorized(
        'Invalid API key, or key could not be resolved to a tenant. Create credentials in Company Settings.'
      ),
    };
  }
  return { ok: true, auth: resolved };
}
