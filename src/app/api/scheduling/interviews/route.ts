/**
 * Interviews API
 * GET  /api/scheduling/interviews
 * POST /api/scheduling/interviews — admin book
 * PATCH — update status / complete / cancel
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId, getSessionUserId } from '@/lib/server-auth';
import {
  listInterviews,
  updateInterview,
} from '@/lib/db/repositories/scheduling-repository';
import {
  adminBookInputSchema,
  updateInterviewInputSchema,
} from '@/lib/schemas/scheduling';
import {
  adminBook,
  markNoShowAndRecover,
} from '@/lib/scheduling/booking';
import { setCandidatePipelineStage } from '@/lib/candidates/stage-sync';

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
    const interviews = await listInterviews(tenantId);
    return NextResponse.json({ interviews });
  } catch (error) {
    console.error('[SCHEDULING_IV] GET', error);
    return NextResponse.json(
      { error: 'Failed to list interviews' },
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

    // Action: no-show recovery
    if (body.action === 'no_show' && body.interviewId) {
      const result = await markNoShowAndRecover(
        tenantId,
        body.interviewId,
        baseUrl(request)
      );
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        interview: result.interview,
        recoveryUrl: result.recoveryUrl,
      });
    }

    const parsed = adminBookInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await adminBook(tenantId, parsed.data, userId || undefined);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ interview: result.interview }, { status: 201 });
  } catch (error) {
    console.error('[SCHEDULING_IV] POST', error);
    return NextResponse.json(
      { error: 'Failed to book interview' },
      { status: 500 }
    );
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
    const parsed = updateInterviewInputSchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const patch = { ...parsed.data } as Record<string, unknown>;
    if (parsed.data.status === 'completed') {
      patch.completedAt = new Date().toISOString();
    }
    if (parsed.data.status === 'cancelled') {
      patch.cancelledAt = new Date().toISOString();
    }

    const interview = await updateInterview(tenantId, id, patch as never);
    if (!interview) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Optional stage writeback on complete
    if (parsed.data.status === 'completed') {
      try {
        await setCandidatePipelineStage(
          interview.candidateId,
          'interviewing',
          { tenantId }
        );
      } catch {
        /* ignore */
      }
    }

    return NextResponse.json({ interview });
  } catch (error) {
    console.error('[SCHEDULING_IV] PATCH', error);
    return NextResponse.json(
      { error: 'Failed to update interview' },
      { status: 500 }
    );
  }
}
