// src/app/api/jobs/[id]/events/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getJobEvents } from '@/lib/events/job-events';

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
