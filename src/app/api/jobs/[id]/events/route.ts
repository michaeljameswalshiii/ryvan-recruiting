// src/app/api/jobs/[id]/events/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getJobEvents, recordJobEvent } from '@/lib/events/job-events';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const jobId = params.id;
  console.log(`[Events API] GET request for job ${jobId}`);

  try {
    const limit = request.nextUrl.searchParams.get('limit') ? parseInt(request.nextUrl.searchParams.get('limit')!) : 50;

    const result = await getJobEvents(jobId, { limit });
    console.log(`[Events API] Returning ${result.events?.length || 0} events for job ${jobId}`);

    return NextResponse.json(result);
  } catch (error) {
    console.error(`[Events API] Error for job ${jobId}:`, error);
    return NextResponse.json({ events: [], hasMore: false, totalCount: 0 }, { status: 500 });
  }
}

// === SUPER DIAGNOSTIC TEST POST ===
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const jobId = params.id;
  console.log(`[TEST POST] Started for job ${jobId}`);

  try {
    const body = await request.json().catch(() => ({}));
    const noteText = body.noteText || "Default test note";

    console.log(`[TEST POST] About to call recordJobEvent...`);

    const result = await recordJobEvent(
      jobId,
      'NOTE',
      { title: 'Test Note', description: noteText, metadata: { source: 'diagnostic' } },
      "test-user"
    );

    console.log(`[TEST POST] recordJobEvent FULL result:`, JSON.stringify(result, null, 2));

    const fresh = await getJobEvents(jobId, { limit: 5 });
    console.log(`[TEST POST] Events after attempt:`, fresh.events?.length || 0, fresh);

    return NextResponse.json({ 
      success: true, 
      recordResult: result, 
      eventsAfter: fresh.events 
    });
  } catch (error: any) {
    console.error(`[TEST POST] CRITICAL ERROR:`, {
      message: error.message,
      stack: error.stack ? error.stack.substring(0, 1000) : null
    });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
