/**
 * Tenant-shared Apollo BYOK
 * GET    — status (never returns raw key); any signed-in member
 * POST   — save/validate company Apollo key (team admins only)
 * DELETE — remove company key (team admins only)
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  getSession,
  getSessionTenantId,
  getSessionUserId,
} from '@/lib/server-auth';
import { hasPermission } from '@/lib/roles';
import {
  deleteTenantApolloKey,
  getTenantApolloPublic,
  saveTenantApolloKey,
} from '@/lib/db/repositories/tenant-apollo-credentials-repository';
import { checkApolloHealth } from '@/lib/apollo/client';

export const dynamic = 'force-dynamic';

const MANAGE_ERROR =
  'Only team admins can set or remove the company Apollo key';

async function resolveAuth(request: NextRequest) {
  const session = await getSession();
  const userId =
    request.headers.get('x-user-id') ||
    session?.userId ||
    (await getSessionUserId());
  const tenantId =
    request.headers.get('x-tenant-id') ||
    session?.tenantId ||
    (await getSessionTenantId());
  const email = session?.email;
  const role = session?.role;
  const canManage = hasPermission(role, 'team_admin');
  return { userId, tenantId, email, role, canManage };
}

export async function GET(request: NextRequest) {
  try {
    const { userId, tenantId, canManage } = await resolveAuth(request);
    if (!userId || !tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const status = await getTenantApolloPublic(tenantId);
    const health = await checkApolloHealth({ tenantId });

    return NextResponse.json({
      ...status,
      connected: health.connected,
      healthMessage: health.message,
      activeSource: health.source,
      canManage,
      description:
        'One Apollo key for your whole company. Team admins set the key; everyone in the tenant can use it for People/Company search.',
    });
  } catch (err: any) {
    console.error('[tenant/apollo GET]', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to load Apollo status' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, tenantId, email, canManage } = await resolveAuth(request);
    if (!userId || !tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!canManage) {
      return NextResponse.json({ error: MANAGE_ERROR }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const apiKey = String(body.apiKey || body.apolloApiKey || '').trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Paste an Apollo API key' },
        { status: 400 }
      );
    }

    const status = await saveTenantApolloKey({
      tenantId,
      apiKey,
      userId,
      userEmail: email || undefined,
      skipValidation: body.skipValidation === true,
    });

    const health = await checkApolloHealth({ tenantId });

    return NextResponse.json({
      success: true,
      ...status,
      connected: health.connected,
      healthMessage: health.message,
      activeSource: health.source,
      canManage: true,
      message:
        'Apollo key saved for your company. All teammates can use Apollo searches now.',
    });
  } catch (err: any) {
    console.error('[tenant/apollo POST]', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to save Apollo key' },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId, tenantId, canManage } = await resolveAuth(request);
    if (!userId || !tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!canManage) {
      return NextResponse.json({ error: MANAGE_ERROR }, { status: 403 });
    }

    const status = await deleteTenantApolloKey(tenantId);
    const health = await checkApolloHealth({ tenantId });

    return NextResponse.json({
      success: true,
      ...status,
      connected: health.connected,
      healthMessage: health.message,
      activeSource: health.source,
      canManage: true,
      message: 'Company Apollo key removed',
    });
  } catch (err: any) {
    console.error('[tenant/apollo DELETE]', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to remove Apollo key' },
      { status: 500 }
    );
  }
}
