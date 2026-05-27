/**
 * Candidate Events API Route
 * GET /api/candidate/[id]/events
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCandidateEvents } from '@/lib/events/candidate-events';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Candidate ID is required' },
        { status: 400 }
      );
    }

    // Get optional limit from query params
    const searchParams = request.nextUrl.searchParams;
    const limit = searchParams.get('limit');
    const limitNum = limit ? parseInt(limit, 10) : undefined;

const result = await getCandidateEvents(id, { limit: limitNum });

    return NextResponse.json({
      events: result.events,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error('[API] Failed to get candidate events:', error);
    return NextResponse.json(
      { error: 'Failed to get events' },
      { status: 500 }
    );
  }
}
