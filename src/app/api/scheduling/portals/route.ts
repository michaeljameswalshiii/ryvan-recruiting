/**
 * Client interviewer portals API
 * GET / POST /api/scheduling/portals
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId, getSessionUserId } from '@/lib/server-auth';
import {
  createClientPortal,
  listClientPortals,
} from '@/lib/db/repositories/scheduling-repository';
import { createClientPortalInputSchema } from '@/lib/schemas/scheduling';

function baseUrl(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (env) {
    return env.startsWith('http') ? env : `https://${env}`;
  }
  const host = request.headers.get('host') || 'localhost:3000';
  const proto = host.includes('localhost') ? 'http' : 'https';
  return `${proto}://${host}`;
}

export async function GET() {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const portals = await listClientPortals(tenantId);
    return NextResponse.json({ portals });
  } catch (error) {
    console.error('[SCHEDULING_PORTALS] GET', error);
    return NextResponse.json(
      { error: 'Failed to list portals' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = await getSessionUserId();
    const body = await request.json().catch(() => ({}));
    const parsed = createClientPortalInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const portal = await createClientPortal(
      tenantId,
      parsed.data,
      userId || undefined
    );
    const url = `${baseUrl(request)}/client-schedule/${portal.token}`;
    return NextResponse.json({ portal, url }, { status: 201 });
  } catch (error) {
    console.error('[SCHEDULING_PORTALS] POST', error);
    return NextResponse.json(
      { error: 'Failed to create portal' },
      { status: 500 }
    );
  }
}
