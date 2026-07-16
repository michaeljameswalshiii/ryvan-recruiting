/**
 * Candidate Notes API Route
 * POST /api/candidate/[id]/notes
 *
 * When noteType maps to a pipeline stage (Submitted, Interview, Offer Out, …),
 * updates the candidate status in the same request so users don't need a
 * separate stage change (and don't get a duplicate activity row).
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { addNoteToCandidate } from '@/lib/events/candidate-events';
import { getSession } from '@/lib/server-auth';
import { applyStageFromNoteType } from '@/lib/candidates/stage-sync';
import { stageDisplayLabel } from '@/lib/candidates/note-type-stage';

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

    const body = await request.json();
    const { noteText, noteType = 'general', createdBy, stage } = body;

    if (!noteText || noteText.trim() === '') {
      return NextResponse.json(
        { error: 'Note text is required' },
        { status: 400 }
      );
    }

    const session = await getSession();
    const user =
      createdBy || session?.email || session?.userId || 'system';

    // Stage-driving note types (Submitted, Interview Scheduled, …) update pipeline
    const stageResult = await applyStageFromNoteType(id, noteType);
    let stageToStore = stageResult.stageToStore;
    if (!stageToStore && stage) {
      stageToStore = stage;
    }

    const { stageUpdated, previousStage, newStage } = stageResult;
    const finalNoteText = noteText.trim();

    const result = await addNoteToCandidate(id, finalNoteText, user, {
      stage: stageToStore || null,
      noteType,
      stageUpdated,
      previousStage,
      newStage: newStage || stageToStore,
      autoStageSync: stageUpdated,
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
      stageUpdated,
      previousStage,
      status: newStage || stageToStore || undefined,
      stageLabel: newStage ? stageDisplayLabel(newStage) : undefined,
    });
  } catch (error) {
    console.error('[API] Failed to add note:', error);
    return NextResponse.json(
      { error: 'Failed to add note' },
      { status: 500 }
    );
  }
}
