/**
 * GET    /api/list-builder/:id
 * PATCH  /api/list-builder/:id  { action: pause|resume|cancel }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import {
  canManageListBuilderJob,
  canViewListBuilderJob,
  getListBuilderJob,
  setJobStatus,
  setListBuilderVisibility,
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
  if (!job || !canViewListBuilderJob(job, session.userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  // Surface keepable rows: contact (email/phone) or website-only leads
  const results = (job.results || []).filter((r) => {
    const email = (r.email || '').trim();
    const phone = (r.phone || '').trim();
    const hasEmail = !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const hasPhone = !!phone && (phone.match(/\d/g) || []).length >= 7;
    const hasWebsite =
      r.contactCompleteness === 'website' ||
      (!!r.website &&
        r.siteVerified !== false &&
        (r.verificationStatus === 'partial' ||
          r.verificationStatus === 'verified' ||
          r.siteVerified === true));
    return hasEmail || hasPhone || (hasWebsite && !!(r.website || r.companyName));
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
      isOwner: canManageListBuilderJob(job, session.userId),
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
  if (!job || !canViewListBuilderJob(job, session.userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    /* empty */
  }
  const action = String(body.action || '').toLowerCase();

  // Anyone who can view may tick (advance) a public running job so shared queues keep moving
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

  // Import-style selection can be done by any viewer on public lists
  if (action === 'select_rows' && Array.isArray(body.rowIds)) {
    const selected = new Set(body.rowIds.map(String));
    const results = (job.results || []).map((r) => ({
      ...r,
      selected: selected.has(r.id),
    }));
    const updated = await updateListBuilderJob(session.tenantId, id, { results });
    return NextResponse.json({ job: updated });
  }

  // Owner-only controls below
  if (!canManageListBuilderJob(job, session.userId)) {
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
    const updated = await setListBuilderVisibility(
      session.tenantId,
      session.userId,
      id,
      v
    );
    return NextResponse.json({ job: updated });
  }

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

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
