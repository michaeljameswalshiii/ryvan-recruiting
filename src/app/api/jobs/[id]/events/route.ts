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

// === TEMPORARY TEST ENDPOINT - REMOVE AFTER TESTING ===
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const jobId = params.id;
  console.log(`[Events API TEST] POST request for job ${jobId}`);

  try {
    const body = await request.json();
    const { noteText = "Test note from API", createdBy = "test-user" } = body;

    const result = await recordJobEvent(
      jobId,
      'NOTE',
      { 
        title: 'Note Added', 
        description: noteText,
        metadata: { source: 'manual-test' } 
      },
      createdBy
    );

    console.log(`[Events API TEST] Record result:`, result);

    // Refresh events
    const freshEvents = await getJobEvents(jobId, { limit: 10 });

    return NextResponse.json({ 
      success: true, 
      recordResult: result, 
      eventsNow: freshEvents.events 
    });
  } catch (error) {
    console.error(`[Events API TEST] Error:`, error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
