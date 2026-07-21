/**
 * Company Notes API Route
 * POST /api/companies/[id]/notes
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { addNoteToCompany } from '@/lib/events/company-events';

export async function POST(
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

    // Parse the request body
    const body = await request.json();
    const { noteText, noteType = 'general', createdBy } = body;

    // Detail text optional — type alone is enough
    const text = typeof noteText === 'string' ? noteText.trim() : '';

    // Use provided createdBy or default to 'system'
    const user = createdBy || 'system';

    const result = await addNoteToCompany(id, text, user, noteType);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to add note' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      eventId: result.eventId,
    });
  } catch (error) {
    console.error('[API] Failed to add note:', error);
    return NextResponse.json(
      { error: 'Failed to add note' },
      { status: 500 }
    );
  }
}
