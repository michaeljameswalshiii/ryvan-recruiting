import { redirect } from "next/navigation";
import { OAuthConsentClient } from "@/components/mcp/OAuthConsentClient";
import { getSession, getSessionTenantId } from "@/lib/server-auth";
import {
  findMcpOAuthClient,
  isPublicOAuthClient,
  oauthMcpResource,
  redirectUriAllowed,
  resolveAuthorizeTenantId,
  resourceMatchesMcp,
  scopeAllowsMcp,
} from "@/lib/mcp/oauth";
import { hasPermission, isSiteAdmin } from "@/lib/roles";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;
  const request = {
    response_type: first(raw.response_type),
    client_id: first(raw.client_id),
    redirect_uri: first(raw.redirect_uri),
    scope: first(raw.scope) || "mcp",
    state: first(raw.state),
    code_challenge: first(raw.code_challenge),
    code_challenge_method: first(raw.code_challenge_method),
    resource: first(raw.resource) || oauthMcpResource(),
  };

  const returnPath = `/oauth/authorize?${new URLSearchParams(request).toString()}`;
  const session = await getSession();
  const sessionTenantId = (await getSessionTenantId()) || session?.tenantId || "";
  if (!session?.userId) {
    redirect(`/login?redirect=${encodeURIComponent(returnPath)}`);
  }

  if (!hasPermission(session.role, "team_admin")) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md rounded-xl border border-amber-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-950">
            Administrator approval required
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Only an organization administrator can authorize this MCP connection.
            Log in as a Company Admin or Site Admin and try again.
          </p>
        </div>
      </main>
    );
  }

  const found = await findMcpOAuthClient(request.client_id);
  const reasons: string[] = [];
  if (!found) {
    reasons.push(
      "Unknown OAuth client_id. Claude should register via Dynamic Client Registration, or create an OAuth client in Company Settings → Integrations → Claude / MCP and paste Client ID/Secret into Claude Advanced settings."
    );
  } else {
    if (!redirectUriAllowed(found.client, request.redirect_uri)) {
      reasons.push(
        `Callback URL not allowed: ${request.redirect_uri || "(missing)"}. Expected a Claude callback such as https://claude.ai/api/mcp/auth_callback`
      );
    }
    if (request.response_type !== "code") {
      reasons.push("response_type must be code");
    }
    if (request.code_challenge_method !== "S256") {
      reasons.push("PKCE required (code_challenge_method=S256)");
    }
    if (!request.code_challenge) {
      reasons.push("Missing PKCE code_challenge");
    }
    if (!scopeAllowsMcp(request.scope)) {
      reasons.push(`Unsupported scope: ${request.scope || "(empty)"}`);
    }
    if (!resourceMatchesMcp(request.resource)) {
      reasons.push(
        `Resource mismatch. Got ${request.resource || "(empty)"}; expected ${oauthMcpResource()}`
      );
    }
  }

  let effectiveTenantId = sessionTenantId;
  if (found && reasons.length === 0) {
    const resolved = resolveAuthorizeTenantId({
      clientTenantId: found.tenantId,
      sessionTenantId,
      isSiteAdmin: isSiteAdmin(session.role),
      unbound: isPublicOAuthClient(found.client) || !!found.client.unbound,
    });
    if ("error" in resolved) {
      reasons.push(resolved.error);
    } else {
      effectiveTenantId = resolved.tenantId;
    }
  }

  if (!found || reasons.length > 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="max-w-lg rounded-xl border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-950">
            Invalid connection request
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Claude reached Trio, but this OAuth request could not be approved:
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
            <p>
              <strong>Quick fix:</strong> In Trio, select your{" "}
              <em>customer</em> company (not All Tenants), open Company Settings
              → Integrations → Claude / MCP, create an <strong>OAuth client</strong>,
              then in Claude connector Advanced settings paste Client ID + Secret.
            </p>
            <p>
              Or remove and re-add the connector so Claude can re-run Dynamic
              Client Registration after the latest deploy.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <OAuthConsentClient
      clientName={found.client.name}
      request={{ ...request, _effective_tenant_id: effectiveTenantId }}
    />
  );
}
