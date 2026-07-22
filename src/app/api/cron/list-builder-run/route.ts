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

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV !== 'production') return true;
    return false;
  }
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const header = request.headers.get('x-cron-secret') || '';
  return bearer === secret || header === secret;
}

async function handle(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
    return NextResponse.json(
      { error: 'Scan failed', detail: String(err) },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    processed,
    errors,
    done: doneCount,
    elapsedMs: Date.now() - started,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
