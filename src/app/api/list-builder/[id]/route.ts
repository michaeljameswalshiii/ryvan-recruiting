/**
 * GET    /api/list-builder/:id
 * PATCH  /api/list-builder/:id  { action: pause|resume|cancel }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import {
  getListBuilderJob,
  setJobStatus,
  updateListBuilderJob,
} from '@/lib/db/repositories/list-builder-repository';
import { processListBuilderBatch } from '@/lib/list-builder/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || !session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const job = await getListBuilderJob(session.tenantId, id);
  if (!job || job.userId !== session.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  // Surface keepable contacts: complete (email+phone) and partial (email or phone)
  const results = (job.results || []).filter((r) => {
    const email = (r.email || '').trim();
    const phone = (r.phone || '').trim();
    const hasEmail = !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const hasPhone = !!phone && (phone.match(/\d/g) || []).length >= 7;
    return hasEmail || hasPhone;
  });
  const completeFound = results.filter((r) => {
    const email = (r.email || '').trim();
    const phone = (r.phone || '').trim();
    return (
      email &&
      phone &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      (phone.match(/\d/g) || []).length >= 7
    );
  }).length;
  return NextResponse.json({
    job: {
      ...job,
      results,
      progress: {
        ...job.progress,
        found: results.length,
        completeFound,
        partialFound: results.length - completeFound,
      },
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || !session?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const job = await getListBuilderJob(session.tenantId, id);
  if (!job || job.userId !== session.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    /* empty */
  }
  const action = String(body.action || '').toLowerCase();

  if (action === 'pause') {
    if (!['queued', 'running'].includes(job.status)) {
      return NextResponse.json({ error: 'Cannot pause in this state' }, { status: 400 });
    }
    const updated = await setJobStatus(session.tenantId, id, 'paused', {
      progress: { ...job.progress, lastMessage: 'Paused by user.' },
    });
    return NextResponse.json({ job: updated });
  }

  if (action === 'resume') {
    if (job.status !== 'paused' && job.status !== 'queued') {
      return NextResponse.json({ error: 'Cannot resume in this state' }, { status: 400 });
    }
    await setJobStatus(session.tenantId, id, 'running', {
      progress: { ...job.progress, lastMessage: 'Resumed…' },
    });
    try {
      await processListBuilderBatch(session.tenantId, id);
    } catch (err) {
      console.error('[list-builder resume]', err);
    }
    const fresh = await getListBuilderJob(session.tenantId, id);
    return NextResponse.json({ job: fresh });
  }

  if (action === 'cancel') {
    const updated = await setJobStatus(session.tenantId, id, 'cancelled', {
      progress: { ...job.progress, lastMessage: 'Cancelled by user.' },
    });
    return NextResponse.json({ job: updated });
  }

  if (action === 'tick' || action === 'process') {
    if (job.status === 'paused' || job.status === 'cancelled') {
      return NextResponse.json({ job, message: 'Not runnable' });
    }
    try {
      await processListBuilderBatch(session.tenantId, id);
    } catch (err) {
      console.error('[list-builder tick]', err);
    }
    const fresh = await getListBuilderJob(session.tenantId, id);
    return NextResponse.json({ job: fresh });
  }

  if (action === 'select_rows' && Array.isArray(body.rowIds)) {
    const selected = new Set(body.rowIds.map(String));
    const results = (job.results || []).map((r) => ({
      ...r,
      selected: selected.has(r.id),
    }));
    const updated = await updateListBuilderJob(session.tenantId, id, { results });
    return NextResponse.json({ job: updated });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
