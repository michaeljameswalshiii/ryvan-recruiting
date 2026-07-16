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
    const { eventType, title, description, metadata, createdBy } = body;

    if (!eventType || !title) {
      return NextResponse.json(
        { error: 'eventType and title are required' },
        { status: 400 }
      );
    }

    const details: EventDetails = {
      title,
      description: description || '',
      metadata: metadata || {},
    };

    // Use provided createdBy or fallback to system
    const userCreatedBy = createdBy || 'system';

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

    return NextResponse.json({
      success: true,
      eventId: result.eventId,
      event: result.event,
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Failed to delete candidate event:', error);
    return NextResponse.json(
      { error: 'Failed to delete event' },
      { status: 500 }
    );
  }
}
