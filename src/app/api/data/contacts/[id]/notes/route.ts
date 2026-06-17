import { NextRequest, NextResponse } from 'next/server';
import { createEvent, getEventsForContact } from '@/lib/db/repositories/event-repository';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: contactId } = params;
    const body = await request.json();

    if (!body.type || !body.content) {
      return NextResponse.json(
        { error: 'Type and content are required' },
        { status: 400 }
      );
    }

    const result = await createEvent({
      contactId,
      companyId: body.companyId,
      type: body.type,
      content: body.content,
      createdBy: body.createdBy || 'current-user',
      metadata: body.metadata,
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
  { params }: { params: { id: string } }
) {
  try {
    const { id: contactId } = params;
    const { events } = await getEventsForContact(contactId);
    return NextResponse.json({ events });
  } catch (error: any) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch activity' },
      { status: 500 }
    );
  }
}
