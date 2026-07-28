/**
 * Self-schedule links API
 * GET  /api/scheduling/links
 * POST /api/scheduling/links — create link (+ optional sequence hook)
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId, getSessionUserId } from '@/lib/server-auth';
import { listScheduleLinks } from '@/lib/db/repositories/scheduling-repository';
import { createScheduleLinkInputSchema } from '@/lib/schemas/scheduling';
import { createLinkWithUrl } from '@/lib/scheduling/booking';
import { getLeadById } from '@/lib/db/repositories/lead-repository';
import { getJobById } from '@/lib/db/repositories/job-repository';
import { getPlan } from '@/lib/db/repositories/scheduling-repository';

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
    const links = await listScheduleLinks(tenantId);
    return NextResponse.json({ links });
  } catch (error) {
    console.error('[SCHEDULING_LINKS] GET', error);
    return NextResponse.json({ error: 'Failed to list links' }, { status: 500 });
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
    const parsed = createScheduleLinkInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = { ...parsed.data };

    // Enrich from candidate / job / plan
    try {
      const lead = await getLeadById(tenantId, data.candidateId);
      if (lead) {
        data.candidateName =
          data.candidateName ||
          (lead as { name?: string }).name ||
          (lead as { fullName?: string }).fullName;
        if (!data.candidateEmail) {
          data.candidateEmail = (lead as { email?: string }).email || '';
        }
      }
    } catch {
      /* ignore */
    }

    if (data.jobId && !data.jobTitle) {
      try {
        const job = await getJobById(tenantId, data.jobId);
        if (job) data.jobTitle = (job as { title?: string }).title;
      } catch {
        /* ignore */
      }
    }

    if (data.planId) {
      try {
        const plan = await getPlan(tenantId, data.planId);
        if (plan) {
          const step =
            plan.steps.find((s) => s.id === data.planStepId) || plan.steps[0];
          if (step) {
            data.planStepId = step.id;
            data.interviewTypeName = data.interviewTypeName || step.name;
            data.durationMinutes = data.durationMinutes || step.durationMinutes;
            data.locationType = data.locationType || step.locationType;
            data.stageOnBook = data.stageOnBook || step.stageOnBook;
            data.poolId = data.poolId || step.poolId;
          }
        }
      } catch {
        /* ignore */
      }
    }

    const { link, url } = await createLinkWithUrl(
      tenantId,
      data,
      baseUrl(request),
      userId || undefined
    );

    return NextResponse.json({ link, url }, { status: 201 });
  } catch (error) {
    console.error('[SCHEDULING_LINKS] POST', error);
    return NextResponse.json({ error: 'Failed to create link' }, { status: 500 });
  }
}
