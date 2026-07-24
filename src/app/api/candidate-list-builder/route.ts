/**
 * GET  /api/candidate-list-builder — list candidate agent jobs
 * POST /api/candidate-list-builder — start a new People Data Labs candidate agent
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import {
  createCandidateListBuilderJob,
  listCandidateJobsForUser,
} from '@/lib/db/repositories/candidate-list-builder-repository';
import { processCandidateListBuilderBatch } from '@/lib/candidate-list-builder/runner';
import { isPdlConfigured } from '@/lib/pdl/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || !session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const full = request.nextUrl.searchParams.get('full') === '1';
  const jobs = await listCandidateJobsForUser(session.tenantId, session.userId, {
    includeResults: full,
  });
  const annotated = jobs.map((j) => ({
    ...j,
    isOwner: j.userId === session.userId,
  }));
  return NextResponse.json({
    jobs: annotated,
    pdlConfigured: isPdlConfigured(),
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || !session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isPdlConfigured()) {
    return NextResponse.json(
      {
        error:
          'People Data Labs is not configured. Add PEOPLE_DATA_LABS_API_KEY (or PDL_API_KEY) from your PDL account or AWS Data Exchange subscription.',
      },
      { status: 400 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const visibilityRaw = String(body.visibility || body.sharing || '')
    .toLowerCase()
    .trim();
  const visibility =
    visibilityRaw === 'public' || visibilityRaw === 'shared'
      ? 'public'
      : visibilityRaw === 'private'
        ? 'private'
        : undefined;

  const { job, error } = await createCandidateListBuilderJob(
    session.tenantId,
    session.userId,
    {
      brief: body.brief || body.description || '',
      geography: body.geography,
      targetSize: body.targetSize ? Number(body.targetSize) : undefined,
      titles: Array.isArray(body.titles) ? body.titles : undefined,
      industries: Array.isArray(body.industries) ? body.industries : undefined,
      companies: Array.isArray(body.companies) ? body.companies : undefined,
      keywords: Array.isArray(body.keywords) ? body.keywords : undefined,
      visibility,
    }
  );

  if (error || !job) {
    return NextResponse.json(
      { error: error || 'Failed to create job' },
      { status: 400 }
    );
  }

  try {
    await processCandidateListBuilderBatch(session.tenantId, job.id);
  } catch (err) {
    console.error('[candidate-list-builder] first batch error', err);
  }

  const jobs = await listCandidateJobsForUser(session.tenantId, session.userId);
  const fresh = jobs.find((j) => j.id === job.id) || job;
  return NextResponse.json({
    job: fresh,
    jobs,
    pdlConfigured: true,
  });
}
