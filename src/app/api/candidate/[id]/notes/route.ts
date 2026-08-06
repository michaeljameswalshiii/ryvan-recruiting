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
    const {
      noteText,
      noteType = 'general',
      stage,
      jobId,
      jobTitle,
      companyName,
    } = body;

    // Detail text is optional — action type alone can be logged
    const finalNoteText =
      typeof noteText === 'string' ? noteText.trim() : '';

    const session = await getSession();
    if (!session?.userId || !session?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = session.email || session.userId;

    const scopedJobId =
      typeof jobId === 'string' && jobId.trim() ? jobId.trim() : null;
    const scopedJobTitle =
      typeof jobTitle === 'string' && jobTitle.trim()
        ? jobTitle.trim()
        : null;
    const scopedCompany =
      typeof companyName === 'string' && companyName.trim()
        ? companyName.trim()
        : null;

    // Stage-driving note types update that job's pipeline (or candidate if no job)
    const stageResult = await applyStageFromNoteType(id, noteType, {
      jobId: scopedJobId,
    });
    let stageToStore = stageResult.stageToStore;
    if (!stageToStore && stage) {
      stageToStore = stage;
    }

    const { stageUpdated, previousStage, newStage } = stageResult;

    const result = await addNoteToCandidate(id, finalNoteText, user, {
      stage: stageToStore || null,
      noteType,
      jobId: scopedJobId,
      jobTitle: scopedJobTitle,
      companyName: scopedCompany,
      stageUpdated,
      previousStage,
      newStage: newStage || stageToStore,
      autoStageSync: stageUpdated,
      actorUserId: session.userId,
      actorEmail: session.email,
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
      jobId: scopedJobId || undefined,
      jobTitle: scopedJobTitle || undefined,
    });
  } catch (error) {
    console.error('[API] Failed to add note:', error);
    return NextResponse.json(
      { error: 'Failed to add note' },
      { status: 500 }
    );
  }
}
