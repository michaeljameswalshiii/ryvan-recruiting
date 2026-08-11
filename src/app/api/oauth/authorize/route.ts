import { NextRequest, NextResponse } from "next/server";
import { getSession, getSessionTenantId } from "@/lib/server-auth";
import { hasPermission, isSiteAdmin } from "@/lib/roles";
import {
  createAuthorizationCode,
  findMcpOAuthClient,
  isPublicOAuthClient,
  oauthMcpResource,
  redirectUriAllowed,
  resolveAuthorizeTenantId,
  resourceMatchesMcp,
  scopeAllowsMcp,
} from "@/lib/mcp/oauth";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const sessionTenantId =
      (await getSessionTenantId()) || session?.tenantId || "";
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(session.role, "team_admin")) {
      return NextResponse.json(
        { error: "Only organization admins can authorize an MCP connection" },
        { status: 403 }
      );
    }
    const body = await request.json().catch(() => ({}));
    const clientId = String(body.client_id || "");
    const redirectUri = String(body.redirect_uri || "");
    const state = String(body.state || "");
    const resource = String(body.resource || oauthMcpResource());
    const codeChallenge = String(body.code_challenge || "");
    const client = await findMcpOAuthClient(clientId);

    if (
      !client ||
      !redirectUriAllowed(client.client, redirectUri) ||
      body.response_type !== "code" ||
      body.code_challenge_method !== "S256" ||
      !codeChallenge ||
      !scopeAllowsMcp(String(body.scope || "mcp")) ||
      !resourceMatchesMcp(resource)
    ) {
      return NextResponse.json(
        { error: "Invalid OAuth authorization request" },
        { status: 400 }
      );
    }

    const forcedTenant = String(body._effective_tenant_id || "").trim();
    const resolved = resolveAuthorizeTenantId({
      clientTenantId: client.tenantId,
      sessionTenantId: forcedTenant || sessionTenantId,
      isSiteAdmin: isSiteAdmin(session.role),
      unbound: isPublicOAuthClient(client.client) || !!client.client.unbound,
    });
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }

    const code = await createAuthorizationCode({
      tenantId: resolved.tenantId,
      clientId,
      userId: session.userId,
      redirectUri,
      codeChallenge,
      scope: "mcp",
      resource: oauthMcpResource(),
    });
    const callback = new URL(redirectUri);
    callback.searchParams.set("code", code);
    if (state) callback.searchParams.set("state", state);
    return NextResponse.json({ redirectTo: callback.toString() });
  } catch (error) {
    console.error("[POST /api/oauth/authorize]", error);
    return NextResponse.json(
      { error: "Unable to authorize this connection" },
      { status: 500 }
    );
  }
}
