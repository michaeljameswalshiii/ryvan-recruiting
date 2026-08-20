/**
 * Company Events API Route
 * GET /api/companies/[id]/events
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getCompanyEvents,
  updateCompanyEvent,
  deleteCompanyEvent,
} from '@/lib/events/company-events';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      );
    }

    // Get optional limit from query params
    const searchParams = request.nextUrl.searchParams;
    const limit = searchParams.get('limit');
    const limitNum = limit ? parseInt(limit, 10) : undefined;

    const result = await getCompanyEvents(id, limitNum);

    return NextResponse.json({
      events: result.events,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error('[API] Failed to get company events:', error);
    return NextResponse.json(
      { error: 'Failed to get events' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const eventId = String(body.eventId || '').trim();
    if (!id || !eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }
    const result = await updateCompanyEvent(id, eventId, {
      noteText: body.noteText,
      noteType: body.noteType,
      title: body.title,
      description: body.description,
    });
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to update' },
        { status: result.error === 'Event not found' ? 404 : 400 }
      );
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = String(request.nextUrl.searchParams.get('eventId') || '').trim();
    if (!id || !eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }
    const result = await deleteCompanyEvent(id, eventId);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to delete' },
        { status: result.error === 'Event not found' ? 404 : 400 }
      );
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
  }
}
