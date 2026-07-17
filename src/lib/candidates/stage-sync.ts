/**
 * Pipeline stage writes for candidates.
 * Always keep lead.status and linkedJobs[].stage in sync — the candidates list
 * prefers linked job stage, so updating only status leaves the UI stuck.
 *
 * @serverOnly
 */

import {
  getSessionTenantId,
  getSessionUserId,
} from '@/lib/server-auth';
import { getLeadById, updateLead } from '@/lib/db/repositories/lead-repository';
import { updateCandidateStageInJob } from '@/lib/db/repositories/job-repository';
import { stageFromNoteType } from '@/lib/candidates/note-type-stage';

/** Normalize status strings for equality checks */
export function normStatus(s: string | null | undefined): string {
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

export type SetStageResult = {
  stageUpdated: boolean;
  previousStage: string | null;
  newStage: string | null;
  stageToStore: string | null;
  tenantId: string | null;
  linkedJobsSynced: boolean;
};

/**
 * Set candidate pipeline stage on BOTH:
 *  - lead.status
 *  - every linkedJobs[].stage (application-centric list reads these)
 */
export async function setCandidatePipelineStage(
  candidateId: string,
  nextStage: string,
  options?: {
    tenantId?: string | null;
    /** Only update the first linked job (default: all linked jobs) */
    primaryJobOnly?: boolean;
  }
): Promise<SetStageResult> {
  const target = normStatus(nextStage);
  const empty: SetStageResult = {
    stageUpdated: false,
    previousStage: null,
    newStage: null,
    stageToStore: null,
    tenantId: null,
    linkedJobsSynced: false,
  };

  if (!candidateId || !target) return empty;

  const tenantId =
    options?.tenantId || (await resolveCandidateTenantId());
  if (!tenantId) {
    console.warn(
      '[stage-sync] setCandidatePipelineStage: no tenantId',
      candidateId
    );
    return { ...empty, stageToStore: target, newStage: target };
  }

  try {
    const lead = await getLeadById(tenantId, candidateId);
    if (!lead) {
      console.warn(
        '[stage-sync] setCandidatePipelineStage: lead not found',
        tenantId,
        candidateId
      );
      return {
        ...empty,
        tenantId,
        stageToStore: target,
        newStage: target,
      };
    }

    const previousStage = (lead as any).status || null;
    const currentStatus = normStatus(previousStage);
    const linked = Array.isArray((lead as any).linkedJobs)
      ? (lead as any).linkedJobs.map((j: any) => ({ ...j }))
      : [];

    const jobsNeedSync = linked.some(
      (j: any) => normStatus(j?.stage) !== target
    );
    const statusNeedsSync = currentStatus !== target;

    if (!statusNeedsSync && !jobsNeedSync) {
      return {
        stageUpdated: false,
        previousStage,
        newStage: target,
        stageToStore: target,
        tenantId,
        linkedJobsSynced: false,
      };
    }

    const patch: Record<string, unknown> = {};
    if (statusNeedsSync) {
      patch.status = target;
    }

    let linkedJobsSynced = false;
    if (jobsNeedSync && linked.length > 0) {
      const now = new Date().toISOString();
      if (options?.primaryJobOnly) {
        linked[0] = {
          ...linked[0],
          stage: target,
          stageUpdatedAt: now,
        };
      } else {
        for (let i = 0; i < linked.length; i++) {
          linked[i] = {
            ...linked[i],
            stage: target,
            stageUpdatedAt: now,
          };
        }
      }
      patch.linkedJobs = linked;
      linkedJobsSynced = true;
    }

    await updateLead(tenantId, candidateId, patch as any);

    // Also sync job.candidates[] (desk next-actions reads stage from the job record).
    // Prefer linkedJobs; fall back to any job ids we can infer.
    const jobIds = new Set<string>();
    for (const j of linked) {
      if (j?.jobId) jobIds.add(String(j.jobId));
    }
    if (options?.primaryJobOnly && linked[0]?.jobId) {
      jobIds.clear();
      jobIds.add(String(linked[0].jobId));
    }
    for (const jobId of jobIds) {
      try {
        await updateCandidateStageInJob(tenantId, jobId, {
          candidateId,
          stage: target as any,
        });
      } catch (syncErr) {
        console.warn(
          '[stage-sync] job.candidates stage sync failed',
          jobId,
          candidateId,
          syncErr
        );
      }
    }

    return {
      stageUpdated: true,
      previousStage,
      newStage: target,
      stageToStore: target,
      tenantId,
      linkedJobsSynced,
    };
  } catch (err) {
    console.warn('[stage-sync] setCandidatePipelineStage failed:', err);
    return {
      ...empty,
      tenantId,
      stageToStore: target,
      newStage: target,
    };
  }
}

/**
 * Apply pipeline stage implied by a note type (Submitted → submitted, etc.).
 */
export async function applyStageFromNoteType(
  candidateId: string,
  noteType: string | null | undefined,
  _options?: { force?: boolean }
): Promise<SetStageResult> {
  const impliedStage = stageFromNoteType(noteType);
  if (!impliedStage) {
    return {
      stageUpdated: false,
      previousStage: null,
      newStage: null,
      stageToStore: null,
      tenantId: null,
      linkedJobsSynced: false,
    };
  }

  return setCandidatePipelineStage(candidateId, impliedStage);
}
