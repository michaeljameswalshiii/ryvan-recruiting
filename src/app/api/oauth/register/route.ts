/**
 * RFC 7591 Dynamic Client Registration for Claude custom connectors.
 * Public endpoint — Claude registers a public PKCE client automatically.
 */

import { NextRequest, NextResponse } from "next/server";
import { registerDynamicMcpOAuthClient } from "@/lib/mcp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const redirectUris = Array.isArray(body.redirect_uris)
      ? body.redirect_uris.map(String)
      : typeof body.redirect_uri === "string"
        ? [body.redirect_uri]
        : [];

    if (!redirectUris.length) {
      return NextResponse.json(
        {
          error: "invalid_redirect_uri",
          error_description: "redirect_uris is required",
        },
        { status: 400 }
      );
    }

    const registered = await registerDynamicMcpOAuthClient({
      redirectUris,
      clientName: String(body.client_name || body.clientName || "Claude Custom Connector"),
      tokenEndpointAuthMethod: String(
        body.token_endpoint_auth_method || "none"
      ),
    });

    return NextResponse.json(registered, { status: 201 });
  } catch (error) {
    console.error("[POST /api/oauth/register]", error);
    const message = error instanceof Error ? error.message : "registration_failed";
    const status = message === "invalid_redirect_uri" ? 400 : 500;
    return NextResponse.json(
      {
        error: status === 400 ? "invalid_redirect_uri" : "server_error",
        error_description: message,
      },
      { status }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
