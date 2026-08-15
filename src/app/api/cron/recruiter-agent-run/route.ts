import { NextRequest, NextResponse } from 'next/server';
import { listRunnableRecruiterRuns } from '@/lib/db/repositories/recruiter-run-repository';
import { processRecruiterRunBatch } from '@/lib/sourcing/recruiter-runner';
import { recordCronHeartbeat } from '@/lib/observability/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return bearer === secret || request.headers.get('x-cron-secret') === secret;
}

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const started = Date.now();
  try {
    const runs = await listRunnableRecruiterRuns();
    let processed = 0;
    for (const run of runs.slice(0, 8)) {
      if (Date.now() - started > 50_000) break;
      await processRecruiterRunBatch(run.tenant_id, run.id);
      processed++;
    }
    const elapsedMs = Date.now() - started;
    await recordCronHeartbeat({
      cronId: 'recruiter-agent-run',
      label: 'Recruiter agent',
      schedule: 'Every minute',
      path: '/api/cron/recruiter-agent-run',
      status: 'ok',
      durationMs: elapsedMs,
      detail: `${processed} run(s) processed`,
    });
    return NextResponse.json({ ok: true, processed, elapsedMs });
  } catch (err) {
    await recordCronHeartbeat({
      cronId: 'recruiter-agent-run',
      label: 'Recruiter agent',
      schedule: 'Every minute',
      path: '/api/cron/recruiter-agent-run',
      status: 'error',
      durationMs: Date.now() - started,
      detail: err instanceof Error ? err.message : 'Cron failed',
    });
    throw err;
  }
}

export async function POST(request: NextRequest) { return GET(request); }
