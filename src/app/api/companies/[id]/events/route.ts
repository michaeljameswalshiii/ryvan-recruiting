/**
 * Company Events API Route
 * GET /api/companies/[id]/events
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCompanyEvents } from '@/lib/events/company-events';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      );
    }

    // Get optional limit from query params
    const searchParams = request.nextUrl.searchParams;
    const limit = searchParams.get('limit');
    const limitNum = limit ? parseInt(limit, 10) : undefined;

    const result = await getCompanyEvents(id, limitNum);

    return NextResponse.json({
      events: result.events,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error('[API] Failed to get company events:', error);
    return NextResponse.json(
      { error: 'Failed to get events' },
      { status: 500 }
    );
  }
}
