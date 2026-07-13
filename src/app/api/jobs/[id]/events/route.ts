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

// === DIAGNOSTIC TEST POST (with timeout - REMOVE LATER) ===
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const jobId = params.id;
  const timeout = (ms: number) => new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Operation timed out')), ms)
  );

  console.log(`[TEST POST] Started for job ${jobId}`);

  try {
    const body = await request.json().catch(() => ({}));
    console.log(`[TEST POST] Body received:`, body);

    const result = await Promise.race([
      recordJobEvent(
        jobId,
        'NOTE',
        { 
          title: 'Test Note', 
          description: body.noteText || "Default test note", 
          metadata: { source: 'diagnostic' } 
        },
        body.createdBy || "test-user"
      ),
      timeout(10000)  // 10 second timeout
    ]);

    console.log(`[TEST POST] Success - recordJobEvent returned:`, result);

    const fresh = await getJobEvents(jobId, { limit: 5 });
    console.log(`[TEST POST] Fresh events count:`, fresh.events?.length || 0);

    return NextResponse.json({ success: true, record: result, events: fresh.events });
  } catch (error: any) {
    console.error(`[TEST POST] ERROR:`, {
      message: error.message,
      stack: error.stack ? error.stack.substring(0, 800) : 'no stack'
    });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
