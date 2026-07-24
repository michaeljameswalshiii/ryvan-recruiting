/**
 * GET    /api/candidate-list-builder/:id
 * PATCH  /api/candidate-list-builder/:id  { action: pause|resume|cancel|tick|select_rows|set_visibility }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import {
  canManageCandidateListBuilderJob,
  canViewCandidateListBuilderJob,
  getCandidateListBuilderJob,
  setCandidateJobStatus,
  setCandidateListBuilderVisibility,
  updateCandidateListBuilderJob,
} from '@/lib/db/repositories/candidate-list-builder-repository';
import { processCandidateListBuilderBatch } from '@/lib/candidate-list-builder/runner';
import { isKeepableCandidate } from '@/lib/candidate-list-builder/runner';

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
  const job = await getCandidateListBuilderJob(session.tenantId, id);
  if (!job || !canViewCandidateListBuilderJob(job, session.userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const results = (job.results || []).filter(isKeepableCandidate);
  const completeFound = results.filter(
    (r) => r.contactCompleteness === 'complete'
  ).length;

  return NextResponse.json({
    job: {
      ...job,
      isOwner: canManageCandidateListBuilderJob(job, session.userId),
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
  const job = await getCandidateListBuilderJob(session.tenantId, id);
  if (!job || !canViewCandidateListBuilderJob(job, session.userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    /* empty */
  }
  const action = String(body.action || '').toLowerCase();

  if (action === 'tick' || action === 'process') {
    if (job.status === 'paused' || job.status === 'cancelled') {
      return NextResponse.json({ job, message: 'Not runnable' });
    }
    try {
      await processCandidateListBuilderBatch(session.tenantId, id);
    } catch (err) {
      console.error('[candidate-list-builder tick]', err);
    }
    const fresh = await getCandidateListBuilderJob(session.tenantId, id);
    return NextResponse.json({ job: fresh });
  }

  if (action === 'select_rows' && Array.isArray(body.rowIds)) {
    const selected = new Set(body.rowIds.map(String));
    const results = (job.results || []).map((r) => ({
      ...r,
      selected: selected.has(r.id),
    }));
    const updated = await updateCandidateListBuilderJob(
      session.tenantId,
      id,
      { results }
    );
    return NextResponse.json({ job: updated });
  }

  if (!canManageCandidateListBuilderJob(job, session.userId)) {
    return NextResponse.json(
      { error: 'Only the list owner can pause, cancel, or change sharing' },
      { status: 403 }
    );
  }

  if (action === 'set_visibility' || action === 'share') {
    const v = String(body.visibility || body.sharing || '').toLowerCase();
    if (v !== 'public' && v !== 'private') {
      return NextResponse.json(
        { error: 'visibility must be public or private' },
        { status: 400 }
      );
    }
    const updated = await setCandidateListBuilderVisibility(
      session.tenantId,
      session.userId,
      id,
      v
    );
    return NextResponse.json({ job: updated });
  }

  if (action === 'pause') {
    if (!['queued', 'running'].includes(job.status)) {
      return NextResponse.json(
        { error: 'Cannot pause in this state' },
        { status: 400 }
      );
    }
    const updated = await setCandidateJobStatus(session.tenantId, id, 'paused', {
      progress: { ...job.progress, lastMessage: 'Paused by user.' },
    });
    return NextResponse.json({ job: updated });
  }

  if (action === 'resume') {
    if (job.status !== 'paused' && job.status !== 'queued') {
      return NextResponse.json(
        { error: 'Cannot resume in this state' },
        { status: 400 }
      );
    }
    await setCandidateJobStatus(session.tenantId, id, 'running', {
      progress: { ...job.progress, lastMessage: 'Resumed…' },
    });
    try {
      await processCandidateListBuilderBatch(session.tenantId, id);
    } catch (err) {
      console.error('[candidate-list-builder resume]', err);
    }
    const fresh = await getCandidateListBuilderJob(session.tenantId, id);
    return NextResponse.json({ job: fresh });
  }

  if (action === 'cancel') {
    const updated = await setCandidateJobStatus(
      session.tenantId,
      id,
      'cancelled',
      {
        progress: { ...job.progress, lastMessage: 'Cancelled by user.' },
      }
    );
    return NextResponse.json({ job: updated });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
