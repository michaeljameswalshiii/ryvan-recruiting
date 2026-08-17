/**
 * Cron: advance active list-builder jobs (all tenants, best-effort).
 * Auth: Bearer CRON_SECRET or x-cron-secret
 *
 * Relies on scanItems pagination so jobs outside the first DynamoDB page
 * are still advanced. Caps jobs per invocation to stay under maxDuration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { tableNames } from '@/lib/db/dynamodb';
import { processListBuilderBatch } from '@/lib/list-builder/runner';
import { recordCronHeartbeat } from '@/lib/observability/store';
import { cronAuthorized, skipIfScheduleOff } from '@/lib/agents/cron-gate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handle(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const skipped = await skipIfScheduleOff(request, 'list-builder-run');
  if (skipped) return skipped;

  let processed = 0;
  let errors = 0;
  let doneCount = 0;
  const maxJobs = 12;
  const started = Date.now();
  const wallMs = 50_000;

  // Scan profiles for running/queued list_builder jobs (paginated full scan)
  try {
    const { scanItems } = await import('@/lib/db/dynamodb');
    const items = await scanItems<any>(
      tableNames.profiles,
      '#t = :t',
      { ':t': 'list_builder' },
      { '#t': 'type' }
    );
    // Prefer oldest-updated first so stuck jobs get fair turns
    const runnable = (items || [])
      .filter((j) => ['queued', 'running'].includes(j.status))
      .sort((a, b) => {
        const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return ta - tb;
      });

    for (const raw of runnable.slice(0, maxJobs)) {
      if (Date.now() - started > wallMs) break;
      const tenantId = raw.tenant_id;
      const jobId = raw.jobId || String(raw.id || '').split('#').pop();
      if (!tenantId || !jobId) continue;
      try {
        const result = await processListBuilderBatch(tenantId, jobId);
        processed++;
        if (result.done) doneCount++;
        if (result.error) errors++;
      } catch (err) {
        console.error('[cron/list-builder] batch', jobId, err);
        errors++;
      }
    }
  } catch (err) {
    console.error('[cron/list-builder] scan', err);
    await recordCronHeartbeat({
      cronId: 'list-builder-run',
      label: 'List builder',
      schedule: 'Every 5 minutes',
      path: '/api/cron/list-builder-run',
      status: 'error',
      durationMs: Date.now() - started,
      detail: String(err),
    });
    return NextResponse.json(
      { error: 'Scan failed', detail: String(err) },
      { status: 500 }
    );
  }

  const elapsedMs = Date.now() - started;
  await recordCronHeartbeat({
    cronId: 'list-builder-run',
    label: 'List builder',
    schedule: 'Every 5 minutes',
    path: '/api/cron/list-builder-run',
    status: errors > 0 ? 'error' : 'ok',
    durationMs: elapsedMs,
    detail: `${processed} processed · ${doneCount} done · ${errors} errors`,
  });

  return NextResponse.json({
    ok: true,
    processed,
    errors,
    done: doneCount,
    elapsedMs,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
