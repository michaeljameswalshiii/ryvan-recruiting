import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import { getRecruiterAgentConfig } from '@/lib/db/repositories/recruiter-agent-repository';
import { createRecruiterRun, listRecruiterRuns } from '@/lib/db/repositories/recruiter-run-repository';
import { parseRadiusPreset, radiusMilesForPreset } from '@/lib/sourcing/radius-location';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session?.tenantId || !session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ runs: await listRecruiterRuns(session.tenantId, session.userId) });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || !session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const config = await getRecruiterAgentConfig(session.tenantId);
  const query = String(body.input || body.query || body.brief || '').trim();
  if (!query) return NextResponse.json({ error: 'A job URL or role brief is required.' }, { status: 400 });
  if (!config.enabled || config.paused) {
    return NextResponse.json({ error: 'Recruiter sourcing is paused in Agent Controls.' }, { status: 409 });
  }
  const target = Math.min(Math.max(Number(body.targetQualified) || config.maxCandidatesPerRun, 1), 100);
  const rawLocation = typeof body.location === 'string' ? body.location.trim() : undefined;
  const locationRadius = parseRadiusPreset(body.locationRadius) || (rawLocation === '' ? 'anywhere' : '25');
  const run = await createRecruiterRun({
    tenant_id: session.tenantId,
    userId: session.userId,
    status: 'queued',
    query,
    location: rawLocation,
    jobId: body.jobId ? String(body.jobId) : undefined,
    locationRadius,
    radiusMiles: radiusMilesForPreset(locationRadius) ?? undefined,
    progressiveWidening: locationRadius !== 'anywhere' && body.progressiveWidening !== false,
    wideningStage: 0,
    wideningHistory: [],
    feedback: {},
    visibility: body.visibility === 'public' ? 'public' : 'private',
    targetQualified: target,
    minFitScore: config.minFitScore,
    batchSize: 25,
    pageOffset: 0,
    candidates: [],
    qualifiedCount: 0,
    estimatedCostUsd: 0,
    notes: [],
    apolloPlan: body.apolloPlan && typeof body.apolloPlan === 'object' ? body.apolloPlan : undefined,
  });
  return NextResponse.json({ run }, { status: 201 });
}
