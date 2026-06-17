/**
 * Job Events API Route
 * GET /api/jobs/[id]/events
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getJobEvents } from '@/lib/events/job-events';

type RouteParams = Promise<{ id: string }>;

export async function GET(request: NextRequest, { params }: { params: RouteParams }) {
  try {
    const { id: jobId } = await params;
    
    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }

    // Get query params
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    // Fetch events using job events service
    const result = await getJobEvents(jobId, { limit });

    if (!result) {
      return NextResponse.json(
        { events: [] },
        { status: 200 }
      );
    }

    return NextResponse.json({
      events: result.events || [],
    });
  } catch (error) {
    console.error('[API] Failed to fetch job events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}
