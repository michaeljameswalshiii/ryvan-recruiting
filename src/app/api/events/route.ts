import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId } from '@/lib/server-auth';
// Import your event recorder or repository here (adjust to your setup)
 // e.g. import { recordEvent } from '@/lib/events';

export async function POST(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { entityType, entityId, eventType, title, description, metadata } = body;

    if (!entityId || !eventType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Record the event (use your existing events system)
    // await recordEvent(tenantId, {
    //   entityType,
    //   entityId,
    //   eventType,
    //   title: title || `Note added`,
    //   description,
    //   metadata: metadata || {},
    // });

    return NextResponse.json({ success: true, event: { id: Date.now().toString(), ...body } });
  } catch (error) {
    console.error('Events API error:', error);
    return NextResponse.json({ error: 'Failed to add note' }, { status: 500 });
  }
}
