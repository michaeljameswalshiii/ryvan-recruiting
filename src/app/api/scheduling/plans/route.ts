/**
 * Job interview plans API
 * GET / POST / PATCH / DELETE /api/scheduling/plans
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId, getSessionUserId } from '@/lib/server-auth';
import {
  createPlan,
  listPlans,
  updatePlan,
  deletePlan,
} from '@/lib/db/repositories/scheduling-repository';
import { createPlanInputSchema } from '@/lib/schemas/scheduling';

export async function GET() {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const plans = await listPlans(tenantId);
    return NextResponse.json({ plans });
  } catch (error) {
    console.error('[SCHEDULING_PLANS] GET', error);
    return NextResponse.json({ error: 'Failed to list plans' }, { status: 500 });
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
    const parsed = createPlanInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const plan = await createPlan(tenantId, parsed.data, userId || undefined);
    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    console.error('[SCHEDULING_PLANS] POST', error);
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 });
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
    const plan = await updatePlan(tenantId, id, rest);
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }
    return NextResponse.json({ plan });
  } catch (error) {
    console.error('[SCHEDULING_PLANS] PATCH', error);
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
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
    const ok = await deletePlan(tenantId, id);
    if (!ok) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[SCHEDULING_PLANS] DELETE', error);
    return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 });
  }
}
