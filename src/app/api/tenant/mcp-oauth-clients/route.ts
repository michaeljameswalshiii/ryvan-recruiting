import { NextRequest, NextResponse } from 'next/server';
import { getSession, getSessionTenantId } from '@/lib/server-auth';
import { hasPermission } from '@/lib/roles';
import {
  createMcpOAuthClient,
  listMcpOAuthClients,
  oauthAppUrl,
  oauthMcpResource,
} from '@/lib/mcp/oauth';

async function adminContext() {
  const session = await getSession();
  const tenantId = await getSessionTenantId();
  if (!session?.userId || !tenantId) return { error: 'Unauthorized', status: 401 } as const;
  if (!hasPermission(session.role, 'team_admin')) {
    return { error: 'Only organization admins can manage MCP OAuth clients', status: 403 } as const;
  }
  return { session, tenantId } as const;
}

export async function GET() {
  try {
    const context = await adminContext();
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }
    return NextResponse.json({
      clients: await listMcpOAuthClients(context.tenantId),
      authorizationUrl: `${oauthAppUrl()}/oauth/authorize`,
      tokenUrl: `${oauthAppUrl()}/api/oauth/token`,
      mcpUrl: oauthMcpResource(),
    });
  } catch (error: any) {
    console.error('[GET /api/tenant/mcp-oauth-clients]', error);
    return NextResponse.json({ error: error?.message || 'Failed to list OAuth clients' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await adminContext();
    if ('error' in context) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }
    const body = await request.json().catch(() => ({}));
    const redirectUris = Array.isArray(body.redirectUris)
      ? body.redirectUris.map(String)
      : typeof body.redirectUri === 'string'
        ? [body.redirectUri]
        : undefined;
    const result = await createMcpOAuthClient({
      tenantId: context.tenantId,
      name: String(body.name || 'Claude OAuth').slice(0, 80),
      createdBy: context.session.email || context.session.userId,
      redirectUris,
    });
    return NextResponse.json({
      success: true,
      ...result,
      authorizationUrl: `${oauthAppUrl()}/oauth/authorize`,
      tokenUrl: `${oauthAppUrl()}/api/oauth/token`,
      mcpUrl: oauthMcpResource(),
    });
  } catch (error: any) {
    console.error('[POST /api/tenant/mcp-oauth-clients]', error);
    return NextResponse.json({ error: error?.message || 'Failed to create OAuth client' }, { status: 400 });
  }
}
