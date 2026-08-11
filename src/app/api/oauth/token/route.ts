import { NextRequest, NextResponse } from "next/server";
import {
  exchangeAuthorizationCode,
  findMcpOAuthClient,
  isPublicOAuthClient,
  oauthMcpResource,
  refreshMcpOAuthToken,
  resourceMatchesMcp,
  validateMcpOAuthClientSecret,
} from "@/lib/mcp/oauth";

function oauthError(error: string, description: string, status = 400) {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } }
  );
}

function readBasicAuth(
  request: NextRequest
): { clientId: string; clientSecret: string } | null {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString(
      "utf8"
    );
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return {
      clientId: decodeURIComponent(decoded.slice(0, separator)),
      clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
    };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) return oauthError("invalid_request", "Form-encoded request required");

  const basic = readBasicAuth(request);
  const clientId = basic?.clientId || String(form.get("client_id") || "");
  const clientSecret =
    basic?.clientSecret || String(form.get("client_secret") || "");

  if (!clientId) {
    return oauthError("invalid_client", "client_id is required", 401);
  }

  const found = await findMcpOAuthClient(clientId);
  if (!found) {
    return oauthError("invalid_client", "Unknown client_id", 401);
  }

  const isPublic = isPublicOAuthClient(found.client);
  if (!isPublic) {
    if (!clientSecret) {
      return oauthError("invalid_client", "Client authentication required", 401);
    }
    const validated = await validateMcpOAuthClientSecret(clientId, clientSecret);
    if (!validated) {
      return oauthError("invalid_client", "Invalid or revoked OAuth client", 401);
    }
  }

  const grantType = String(form.get("grant_type") || "");
  const resource = String(form.get("resource") || oauthMcpResource());
  if (!resourceMatchesMcp(resource)) {
    return oauthError("invalid_target", "Invalid MCP resource");
  }

  try {
    const tokens =
      grantType === "authorization_code"
        ? await exchangeAuthorizationCode({
            code: String(form.get("code") || ""),
            clientId,
            redirectUri: String(form.get("redirect_uri") || ""),
            codeVerifier: String(form.get("code_verifier") || ""),
            resource: oauthMcpResource(),
          })
        : grantType === "refresh_token"
          ? await refreshMcpOAuthToken({
              refreshToken: String(form.get("refresh_token") || ""),
              clientId,
              resource: oauthMcpResource(),
            })
          : null;
    if (!tokens) {
      return oauthError(
        "unsupported_grant_type",
        "Use authorization_code or refresh_token"
      );
    }
    return NextResponse.json(tokens, {
      headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
    });
  } catch {
    return oauthError(
      "invalid_grant",
      "Authorization code or refresh token is invalid or expired"
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, MCP-Protocol-Version",
    },
  });
}
