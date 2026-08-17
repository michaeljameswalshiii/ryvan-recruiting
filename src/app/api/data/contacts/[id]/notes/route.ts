import { NextRequest, NextResponse } from 'next/server';
import { createEvent, getEventsForContact } from '@/lib/db/repositories/event-repository';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await params;
    const body = await request.json();

    if (!body.type) {
      return NextResponse.json(
        { error: 'Activity type is required' },
        { status: 400 }
      );
    }

    // Content/detail text is optional (e.g. "08 No Answer" with no extra note)
    const content =
      typeof body.content === 'string' ? body.content.trim() : '';

    const result = await createEvent({
      contactId,
      companyId: body.companyId,
      type: body.type,
      // Allow empty detail — activity type carries the meaning
      content: content || '',
      createdBy: body.createdBy || 'current-user',
      metadata: {
        ...(body.metadata || {}),
        noteText: content,
        emptyDetail: !content,
      },
    });

    return NextResponse.json({ success: true, event: result.event });
  } catch (error: any) {
    console.error('Error creating activity event:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to log activity' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contactId } = await params;
    const { events } = await getEventsForContact(contactId);
    return NextResponse.json({ events: events || [] });
  } catch (error: any) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch activity' },
      { status: 500 }
    );
  }
}
