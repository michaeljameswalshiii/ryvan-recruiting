/**
 * GET    /api/list-builder/:id
 * PATCH  /api/list-builder/:id  { action: pause|resume|cancel }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';
import {
  canManageListBuilderJob,
  canViewListBuilderJob,
  createListBuilderJob,
  getListBuilderJob,
  setJobStatus,
  setListBuilderVisibility,
  updateListBuilderJob,
} from '@/lib/db/repositories/list-builder-repository';
import { processListBuilderBatch } from '@/lib/list-builder/runner';
import { recordListBuilderFeedback } from '@/lib/db/repositories/list-builder-feedback-repository';
import { LIST_BUILDER_DEFAULTS } from '@/lib/schemas/list-builder';

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
    if (
      job.status === 'paused' ||
      job.status === 'cancelled' ||
      job.status === 'rejected' ||
      job.status === 'failed'
    ) {
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

  if (action === 'update_search') {
    const brief = String(body.brief || job.brief).trim();
    if (!brief) {
      return NextResponse.json({ error: 'Brief is required' }, { status: 400 });
    }
    const targetSize =
      body.targetSize != null && Number.isFinite(Number(body.targetSize))
        ? Math.min(
            Math.max(Math.floor(Number(body.targetSize)), 1),
            LIST_BUILDER_DEFAULTS.maxResultsCap
          )
        : job.targetSize;
    const updated = await updateListBuilderJob(session.tenantId, id, {
      brief,
      industry: body.industry != null ? String(body.industry).trim() : job.industry,
      geography:
        body.geography != null
          ? String(body.geography).trim() || job.geography
          : job.geography,
      targetSize,
    });
    return NextResponse.json({ job: updated });
  }

  if (action === 'reject_search' || action === 'decline') {
    const reason = String(body.reason || '').trim();
    const examples = (job.results || [])
      .filter((r) => !r.imported)
      .slice(0, 12)
      .map((r) => ({
        companyName: r.companyName,
        industry: r.industry,
        city: r.city,
        state: r.state,
      }));
    await recordListBuilderFeedback(session.tenantId, session.userId, {
      action: 'reject',
      jobId: id,
      brief: job.brief,
      geography: job.geography,
      industry: job.industry,
      reason: reason || undefined,
      examples,
    });
    const updated = await setJobStatus(session.tenantId, id, 'rejected', {
      reviewReason: reason || undefined,
      progress: {
        ...job.progress,
        lastMessage: reason
          ? `Declined: ${reason}`
          : 'Declined — will not import this search.',
      },
    });
    return NextResponse.json({ job: updated });
  }

  if (action === 'reject_rows' && Array.isArray(body.rowIds)) {
    const ids = new Set(body.rowIds.map(String));
    const reason = String(body.reason || '').trim();
    const results = (job.results || []).map((r) =>
      ids.has(r.id)
        ? { ...r, rejected: true, rejectedReason: reason || r.rejectedReason, selected: false }
        : r
    );
    const rejectedRows = results.filter((r) => ids.has(r.id));
    if (rejectedRows.length > 0) {
      await recordListBuilderFeedback(session.tenantId, session.userId, {
        action: 'reject',
        jobId: id,
        brief: job.brief,
        geography: job.geography,
        industry: job.industry,
        reason: reason || undefined,
        examples: rejectedRows.slice(0, 12).map((r) => ({
          companyName: r.companyName,
          industry: r.industry,
          city: r.city,
          state: r.state,
        })),
      });
    }
    const updated = await updateListBuilderJob(session.tenantId, id, { results });
    return NextResponse.json({ job: updated });
  }

  if (action === 'restore_rows' && Array.isArray(body.rowIds)) {
    const ids = new Set(body.rowIds.map(String));
    const results = (job.results || []).map((r) =>
      ids.has(r.id) ? { ...r, rejected: false, rejectedReason: undefined } : r
    );
    const updated = await updateListBuilderJob(session.tenantId, id, { results });
    return NextResponse.json({ job: updated });
  }

  if (action === 'revise') {
    const brief = String(body.brief || '').trim();
    if (!brief) {
      return NextResponse.json(
        { error: 'Describe how to revise the search.' },
        { status: 400 }
      );
    }
    const reason = String(body.reason || '').trim();
    const { job: nextJob, error } = await createListBuilderJob(
      session.tenantId,
      session.userId,
      {
        brief,
        industry:
          body.industry != null
            ? String(body.industry).trim()
            : job.industry,
        geography:
          body.geography != null
            ? String(body.geography).trim()
            : job.geography,
        targetSize:
          body.targetSize != null && Number.isFinite(Number(body.targetSize))
            ? Number(body.targetSize)
            : job.targetSize,
        visibility: job.visibility,
        parentJobId: id,
      }
    );
    if (error || !nextJob) {
      return NextResponse.json(
        { error: error || 'Could not start the revised search' },
        { status: 400 }
      );
    }

    await recordListBuilderFeedback(session.tenantId, session.userId, {
      action: 'revise',
      jobId: id,
      brief: job.brief,
      revisedBrief: brief,
      geography: nextJob.geography,
      industry: nextJob.industry,
      reason: reason || undefined,
      examples: (job.results || []).slice(0, 8).map((r) => ({
        companyName: r.companyName,
        industry: r.industry,
        city: r.city,
        state: r.state,
      })),
    });

    if (['queued', 'running', 'paused'].includes(job.status)) {
      await setJobStatus(session.tenantId, id, 'rejected', {
        reviewReason: reason || `Revised toward: ${brief.slice(0, 160)}`,
        revisedToJobId: nextJob.id,
        progress: {
          ...job.progress,
          lastMessage: `Revised — new search started.`,
        },
      });
    } else {
      await updateListBuilderJob(session.tenantId, id, {
        reviewReason: reason || `Revised toward: ${brief.slice(0, 160)}`,
        revisedToJobId: nextJob.id,
        progress: {
          ...job.progress,
          lastMessage: `Revised — new search started.`,
        },
      });
    }

    try {
      await processListBuilderBatch(session.tenantId, nextJob.id);
    } catch (err) {
      console.error('[list-builder revise] first batch', err);
    }
    const fresh = await getListBuilderJob(session.tenantId, nextJob.id);
    return NextResponse.json({ job: fresh || nextJob, revisedFrom: id });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
