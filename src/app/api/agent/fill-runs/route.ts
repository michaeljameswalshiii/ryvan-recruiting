/**
 * GET  /api/agent/fill-runs — own + public fill-job runs for this tenant
 * POST /api/agent/fill-runs — persist a fill-job (Apollo) result for sharing
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import {
  createFillJobRun,
  listFillJobRunsForUser,
  type FillJobVisibility,
} from '@/lib/db/repositories/fill-job-run-repository';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session?.tenantId || !session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runs = await listFillJobRunsForUser(
    session.tenantId,
    session.userId
  );
  const annotated = runs.map((r) => ({
    ...r,
    isOwner: r.userId === session.userId,
  }));
  return NextResponse.json({ runs: annotated });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || !session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const query = String(body.query || body.input || body.brief || '').trim();
  if (!query) {
    return NextResponse.json(
      { error: 'query is required' },
      { status: 400 }
    );
  }

  const visibilityRaw = String(body.visibility || body.sharing || '')
    .toLowerCase()
    .trim();
  const visibility: FillJobVisibility =
    visibilityRaw === 'public' || visibilityRaw === 'shared'
      ? 'public'
      : 'private';

  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  const ownerLabel =
    (session as { email?: string }).email ||
    (session as { fullName?: string }).fullName ||
    session.userId;

  try {
    const run = await createFillJobRun(session.tenantId, session.userId, {
      query,
      visibility,
      ownerLabel: String(ownerLabel),
      jobTitle:
        typeof body.jobTitle === 'string' ? body.jobTitle : undefined,
      jobLocation:
        typeof body.jobLocation === 'string' ? body.jobLocation : undefined,
      estimatedCostUsd:
        typeof body.estimatedCostUsd === 'number'
          ? body.estimatedCostUsd
          : undefined,
      notes: Array.isArray(body.notes) ? body.notes.map(String) : undefined,
      candidates: candidates as Parameters<
        typeof createFillJobRun
      >[2]['candidates'],
      apolloPlan:
        body.apolloPlan && typeof body.apolloPlan === 'object'
          ? (body.apolloPlan as Record<string, unknown>)
          : undefined,
      apolloPlanSource:
        typeof body.apolloPlanSource === 'string'
          ? body.apolloPlanSource
          : undefined,
      usageLine:
        typeof body.usageLine === 'string' ? body.usageLine : undefined,
      error: typeof body.error === 'string' ? body.error : undefined,
    });

    return NextResponse.json({
      run: { ...run, isOwner: true },
      message:
        visibility === 'public'
          ? 'Saved and shared with your team — teammates see it under Fill a job'
          : 'Saved privately — switch to Public to share with teammates',
    });
  } catch (err) {
    console.error('[fill-runs POST]', err);
    return NextResponse.json(
      { error: 'Failed to save fill-job run' },
      { status: 500 }
    );
  }
}
