/**
 * Apply pipeline stage changes implied by activity note types.
 * Used by notes create + activity edit APIs.
 *
 * @serverOnly
 */

import {
  getSessionTenantId,
  getSessionUserId,
} from '@/lib/server-auth';
import { getLeadById, updateLead } from '@/lib/db/repositories/lead-repository';
import { stageFromNoteType } from '@/lib/candidates/note-type-stage';

/** Normalize status strings for equality checks */
function normStatus(s: string | null | undefined): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/**
 * Resolve tenant the same way event writers do, so stage updates don't
 * silently no-op when session.tenantId is briefly missing.
 */
export async function resolveCandidateTenantId(): Promise<string | null> {
  let tenantId = await getSessionTenantId();
  if (!tenantId) {
    const userId = await getSessionUserId();
    if (userId) tenantId = `tenant-${userId}`;
  }
  return tenantId;
}

/**
 * Apply pipeline stage implied by a note type (Submitted → submitted, etc.).
 */
export async function applyStageFromNoteType(
  candidateId: string,
  noteType: string | null | undefined,
  options?: { force?: boolean }
): Promise<{
  stageUpdated: boolean;
  previousStage: string | null;
  newStage: string | null;
  stageToStore: string | null;
  tenantId: string | null;
}> {
  const impliedStage = stageFromNoteType(noteType);
  const empty = {
    stageUpdated: false,
    previousStage: null as string | null,
    newStage: null as string | null,
    stageToStore: null as string | null,
    tenantId: null as string | null,
  };

  if (!impliedStage) return empty;

  const tenantId = await resolveCandidateTenantId();
  if (!tenantId) {
    console.warn(
      '[stage-sync] skipped: no tenantId for candidate',
      candidateId
    );
    return { ...empty, stageToStore: impliedStage, newStage: impliedStage };
  }

  try {
    const lead = await getLeadById(tenantId, candidateId);
    if (!lead) {
      console.warn(
        '[stage-sync] skipped: lead not found',
        tenantId,
        candidateId
      );
      return {
        ...empty,
        tenantId,
        stageToStore: impliedStage,
        newStage: impliedStage,
      };
    }

    const previousStage = (lead as any).status || null;
    const current = normStatus(previousStage);
    const next = normStatus(impliedStage);
    const stageToStore = impliedStage;

    if (current === next && !options?.force) {
      return {
        stageUpdated: false,
        previousStage,
        newStage: impliedStage,
        stageToStore,
        tenantId,
      };
    }

    await updateLead(tenantId, candidateId, {
      status: impliedStage,
    } as any);

    // Keep first linked job stage in sync when present
    const linked = Array.isArray((lead as any).linkedJobs)
      ? [...(lead as any).linkedJobs]
      : [];
    if (linked.length > 0) {
      linked[0] = {
        ...linked[0],
        stage: impliedStage,
      };
      await updateLead(tenantId, candidateId, {
        linkedJobs: linked,
      } as any).catch((err) => {
        console.warn('[stage-sync] linked job stage sync failed:', err);
      });
    }

    return {
      stageUpdated: true,
      previousStage,
      newStage: impliedStage,
      stageToStore,
      tenantId,
    };
  } catch (stageErr) {
    console.warn('[stage-sync] failed (caller may still save note):', stageErr);
    return {
      ...empty,
      tenantId,
      stageToStore: impliedStage,
      newStage: impliedStage,
    };
  }
}
