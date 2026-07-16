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
import { getSession, getSessionTenantId } from '@/lib/server-auth';
import { getLeadById, updateLead } from '@/lib/db/repositories/lead-repository';
import {
  stageFromNoteType,
  stageDisplayLabel,
} from '@/lib/candidates/note-type-stage';

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
    const tenantId = await getSessionTenantId();

    // Resolve stage from note type (preferred) or explicit body.stage
    const impliedStage = stageFromNoteType(noteType);
    let stageToStore: string | null = stage || null;
    let stageUpdated = false;
    let previousStage: string | null = null;
    let newStage: string | null = null;

    if (tenantId && impliedStage) {
      try {
        const lead = await getLeadById(tenantId, id);
        if (lead) {
          previousStage = (lead as any).status || null;
          const current = String(previousStage || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '_');
          const next = impliedStage.toLowerCase();

          // Always set note metadata to the implied stage
          stageToStore = impliedStage;

          if (current !== next) {
            await updateLead(tenantId, id, { status: impliedStage } as any);

            // Keep first linked job stage in sync when present
            const linked = Array.isArray((lead as any).linkedJobs)
              ? [...(lead as any).linkedJobs]
              : [];
            if (linked.length > 0) {
              linked[0] = {
                ...linked[0],
                stage: impliedStage,
              };
              await updateLead(tenantId, id, {
                linkedJobs: linked,
              } as any).catch(() => {});
            }

            stageUpdated = true;
            newStage = impliedStage;
          } else {
            newStage = impliedStage;
          }
        }
      } catch (stageErr) {
        console.warn('[notes] stage sync failed (note still saved):', stageErr);
      }
    } else if (stage) {
      stageToStore = stage;
    }

    // Enrich note text slightly when we advanced the pipeline so the log is clear
    let finalNoteText = noteText.trim();
    if (stageUpdated && newStage) {
      const label = stageDisplayLabel(newStage);
      if (!/stage|pipeline|submitted|interview|offer/i.test(finalNoteText)) {
        // keep user's text; metadata carries stage
      }
      // Prefix once if text doesn't already mention the stage move
      if (!finalNoteText.toLowerCase().includes(label.toLowerCase())) {
        finalNoteText = `${finalNoteText}`;
      }
    }

    const result = await addNoteToCandidate(id, finalNoteText, user, {
      stage: stageToStore || null,
      noteType,
      stageUpdated,
      previousStage,
      newStage: newStage || stageToStore,
      // Mark so clients don't also POST a stage_change note
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
