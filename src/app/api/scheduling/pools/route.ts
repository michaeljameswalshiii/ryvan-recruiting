/**
 * Interviewer pools API
 * GET  /api/scheduling/pools
 * POST /api/scheduling/pools
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId, getSessionUserId } from '@/lib/server-auth';
import {
  createPool,
  listPools,
  updatePool,
  deletePool,
} from '@/lib/db/repositories/scheduling-repository';
import { createPoolInputSchema } from '@/lib/schemas/scheduling';

export async function GET() {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const pools = await listPools(tenantId);
    return NextResponse.json({ pools });
  } catch (error) {
    console.error('[SCHEDULING_POOLS] GET', error);
    return NextResponse.json({ error: 'Failed to list pools' }, { status: 500 });
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
    const parsed = createPoolInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const pool = await createPool(tenantId, parsed.data, userId || undefined);
    return NextResponse.json({ pool }, { status: 201 });
  } catch (error) {
    console.error('[SCHEDULING_POOLS] POST', error);
    return NextResponse.json({ error: 'Failed to create pool' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const { id, ...rest } = body;
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }
    const pool = await updatePool(tenantId, id, rest);
    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }
    return NextResponse.json({ pool });
  } catch (error) {
    console.error('[SCHEDULING_POOLS] PATCH', error);
    return NextResponse.json({ error: 'Failed to update pool' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }
    const ok = await deletePool(tenantId, id);
    if (!ok) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[SCHEDULING_POOLS] DELETE', error);
    return NextResponse.json({ error: 'Failed to delete pool' }, { status: 500 });
  }
}
