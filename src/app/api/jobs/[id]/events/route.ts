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

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    const result = await getJobEvents(jobId, { limit });

    return NextResponse.json({
      events: result?.events || [],
      hasMore: result?.hasMore || false,
      totalCount: result?.totalCount || 0,
    });
  } catch (error) {
    console.error('[API] Failed to fetch job events:', error);
    return NextResponse.json(
      { events: [] },
      { status: 500 }
    );
  }
}
