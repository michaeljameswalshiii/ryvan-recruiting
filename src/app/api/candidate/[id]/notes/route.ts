/**
 * Candidate Notes API Route
 * POST /api/candidate/[id]/notes
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { addNoteToCandidate } from '@/lib/events/candidate-events';

export async function POST(
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

// Parse the request body
    const body = await request.json();
    const { noteText, noteType = 'general', createdBy, stage } = body;

    if (!noteText || noteText.trim() === '') {
      return NextResponse.json(
        { error: 'Note text is required' },
        { status: 400 }
      );
    }

    // Use provided createdBy or default to 'system'
    const user = createdBy || 'system';

    // Include pipeline stage and noteType in metadata for context
    const result = await addNoteToCandidate(id, noteText, user, {
      stage: stage || null,
      noteType: noteType,
    });

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
