/**
 * Candidate Events API Route
 * GET /api/candidate/[id]/events - Get events for a candidate
 * POST /api/candidate/[id]/events - Record an event for a candidate
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getCandidateEvents,
  recordEvent,
  updateCandidateEvent,
  deleteCandidateEvent,
} from '@/lib/events/candidate-events';
import type { CandidateEventType, EventDetails } from '@/lib/events/types';
import { applyStageFromNoteType } from '@/lib/candidates/stage-sync';
import { stageDisplayLabel } from '@/lib/candidates/note-type-stage';
import { getSession } from '@/lib/server-auth';
import {
  isAdminAuthError,
  requireAuthSession,
} from '@/lib/admin-auth';
import { isCompanyAdmin } from '@/lib/roles';
import { getLeadById } from '@/lib/db/repositories/lead-repository';
import {
  requestAuditMeta,
  writeSecurityAudit,
} from '@/lib/security/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Candidate ID is required' },
        { status: 400 }
      );
    }

    // Get optional limit from query params
    const searchParams = request.nextUrl.searchParams;
    const limit = searchParams.get('limit');
    const limitNum = limit ? parseInt(limit, 10) : undefined;

const result = await getCandidateEvents(id, { limit: limitNum });

return NextResponse.json({
      events: result.events,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error('[API] Failed to get candidate events:', error);
    return NextResponse.json(
      { error: 'Failed to get events' },
      { status: 500 }
    );
  }
}

/**
 * POST - Record an event for a candidate
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: candidateId } = await params;
    
    if (!candidateId) {
      return NextResponse.json(
        { error: 'Candidate ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { eventType, title, description, metadata } = body;

    if (!eventType || !title) {
      return NextResponse.json(
        { error: 'eventType and title are required' },
        { status: 400 }
      );
    }

    const session = await getSession();
    if (!session?.userId || !session?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const details: EventDetails = {
      title,
      description: description || '',
      metadata: {
        ...(metadata || {}),
        actorUserId: session.userId,
        actorEmail: session.email,
      },
    };

    const userCreatedBy = session.email || session.userId;

    const result = await recordEvent(
      candidateId,
      eventType as CandidateEventType,
      details,
      userCreatedBy
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to record event' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      eventId: result.eventId,
    });
  } catch (error) {
    console.error('[API] Failed to record candidate event:', error);
    return NextResponse.json(
      { error: 'Failed to record event' },
      { status: 500 }
    );
  }
}

/**
 * PATCH - Update note text / type (or title/description) on an activity log event
 * Body: { eventId, noteText?, noteType?, title?, description? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: candidateId } = await params;
    if (!candidateId) {
      return NextResponse.json(
        { error: 'Candidate ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { eventId, noteText, noteType, title, description } = body || {};

    if (!eventId) {
      return NextResponse.json(
        { error: 'eventId is required' },
        { status: 400 }
      );
    }

    if (
      noteText === undefined &&
      noteType === undefined &&
      title === undefined &&
      description === undefined
    ) {
      return NextResponse.json(
        { error: 'At least one field to update is required' },
        { status: 400 }
      );
    }

    const result = await updateCandidateEvent(candidateId, eventId, {
      noteText,
      noteType,
      title,
      description,
    });

    if (!result.success) {
      const status = result.error === 'Event not found' ? 404 : 400;
      return NextResponse.json(
        { error: result.error || 'Failed to update event' },
        { status }
      );
    }

    // Editing to a stage-driving type (e.g. Submitted) also moves the pipeline
    let stageUpdated = false;
    let newStatus: string | undefined;
    let stageLabel: string | undefined;
    if (noteType !== undefined) {
      const stageResult = await applyStageFromNoteType(candidateId, noteType);
      stageUpdated = stageResult.stageUpdated;
      if (stageResult.newStage) {
        newStatus = stageResult.newStage;
        stageLabel = stageDisplayLabel(stageResult.newStage);
      }
    }

    return NextResponse.json({
      success: true,
      eventId: result.eventId,
      event: result.event,
      stageUpdated,
      status: newStatus,
      stageLabel,
    });
  } catch (error) {
    console.error('[API] Failed to update candidate event:', error);
    return NextResponse.json(
      { error: 'Failed to update event' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Remove an activity log event
 * Body or query: eventId
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: candidateId } = await params;
    if (!candidateId) {
      return NextResponse.json(
        { error: 'Candidate ID is required' },
        { status: 400 }
      );
    }

    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;
    if (!isCompanyAdmin(auth.role)) {
      return NextResponse.json(
        { error: 'Company Admin role is required to delete activity' },
        { status: 403 }
      );
    }

    const candidate = await getLeadById(auth.tenantId, candidateId);
    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    let eventId =
      request.nextUrl.searchParams.get('eventId') ||
      request.nextUrl.searchParams.get('id');

    if (!eventId) {
      try {
        const body = await request.json();
        eventId = body?.eventId || body?.id;
      } catch {
        // no body
      }
    }

    if (!eventId) {
      return NextResponse.json(
        { error: 'eventId is required' },
        { status: 400 }
      );
    }

    const result = await deleteCandidateEvent(candidateId, eventId);

    if (!result.success) {
      const status = result.error === 'Event not found' ? 404 : 400;
      return NextResponse.json(
        { error: result.error || 'Failed to delete event' },
        { status }
      );
    }

    void writeSecurityAudit({
      tenantId: auth.tenantId,
      action: 'admin.candidate_activity.deleted',
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      targetType: 'candidate_activity',
      targetId: eventId,
      summary: `Deleted candidate activity ${eventId}`,
      meta: { candidateId },
      ...requestAuditMeta(request),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Failed to delete candidate event:', error);
    return NextResponse.json(
      { error: 'Failed to delete event' },
      { status: 500 }
    );
  }
}
