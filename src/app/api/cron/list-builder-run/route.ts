/**
 * Cron: advance active list-builder jobs (all tenants, best-effort).
 * Auth: Bearer CRON_SECRET or x-cron-secret
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
  const maxJobs = 25;

  // Scan profiles for running/queued list_builder jobs
  try {
    const { scanItems } = await import('@/lib/db/dynamodb');
    const items = await scanItems<any>(
      tableNames.profiles,
      '#t = :t',
      { ':t': 'list_builder' },
      { '#t': 'type' }
    );
    const runnable = (items || []).filter((j) =>
      ['queued', 'running'].includes(j.status)
    );
    for (const raw of runnable.slice(0, maxJobs)) {
      const tenantId = raw.tenant_id;
      const jobId = raw.jobId || String(raw.id || '').split('#').pop();
      if (!tenantId || !jobId) continue;
      try {
        // Skip if expired handled in runner
        await processListBuilderBatch(tenantId, jobId);
        processed++;
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

  return NextResponse.json({ ok: true, processed, errors });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
