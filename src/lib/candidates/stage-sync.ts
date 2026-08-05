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
    /**
     * When set, only update this linked job's stage (multi-job pipeline).
     * lead.status becomes the "furthest" of all linked job stages after the write.
     */
    jobId?: string | null;
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

    const scopedJobId = options?.jobId
      ? String(options.jobId).trim()
      : '';

    let jobsNeedSync = false;
    if (scopedJobId) {
      jobsNeedSync = linked.some(
        (j: any) =>
          String(j?.jobId || j?.id || '') === scopedJobId &&
          normStatus(j?.stage) !== target
      );
      // Job may only exist on job.candidates[] — still allow write
      if (!jobsNeedSync && linked.every((j: any) => String(j?.jobId || '') !== scopedJobId)) {
        jobsNeedSync = true;
      }
    } else {
      jobsNeedSync = linked.some(
        (j: any) => normStatus(j?.stage) !== target
      );
    }

    let linkedJobsSynced = false;
    const now = new Date().toISOString();
    if (jobsNeedSync && linked.length > 0) {
      if (scopedJobId) {
        let found = false;
        for (let i = 0; i < linked.length; i++) {
          if (String(linked[i]?.jobId || linked[i]?.id || '') !== scopedJobId) {
            continue;
          }
          linked[i] = {
            ...linked[i],
            stage: target,
            stageUpdatedAt: now,
          };
          found = true;
        }
        if (!found) {
          // Stage-only update on job record; keep linkedJobs as-is if missing
        } else {
          linkedJobsSynced = true;
        }
      } else if (options?.primaryJobOnly) {
        linked[0] = {
          ...linked[0],
          stage: target,
          stageUpdatedAt: now,
        };
        linkedJobsSynced = true;
      } else {
        for (let i = 0; i < linked.length; i++) {
          linked[i] = {
            ...linked[i],
            stage: target,
            stageUpdatedAt: now,
          };
        }
        linkedJobsSynced = true;
      }
    }

    // Effective candidate status: furthest of all linked job stages (after patch)
    const STAGE_RANK: Record<string, number> = {
      sourced: 1,
      identification: 1,
      contacted: 2,
      outreach: 2,
      interested: 3,
      conversation: 3,
      pre_screened: 4,
      submitted: 5,
      presented: 5,
      interviewing: 6,
      interview: 6,
      offer_out: 7,
      offer: 7,
      placed: 8,
      accept: 8,
      rejected: 0,
      not_interested: 0,
      dnu: 0,
    };
    const rank = (s: string) => STAGE_RANK[normStatus(s)] ?? 1;

    let effectiveStatus = target;
    if (linked.length > 0) {
      let best = linked[0];
      let bestR = rank(linked[0]?.stage);
      for (const j of linked) {
        const r = rank(j?.stage);
        if (r > bestR) {
          bestR = r;
          best = j;
        }
      }
      // Prefer non-terminal furthest; if all rejected, use target if it was the write
      if (bestR > 0) {
        effectiveStatus = normStatus(best?.stage) || target;
      } else if (rank(target) > 0) {
        effectiveStatus = target;
      } else {
        effectiveStatus = normStatus(best?.stage) || target;
      }
    }

    const statusNeedsSync = currentStatus !== effectiveStatus;

    if (!statusNeedsSync && !linkedJobsSynced && !scopedJobId) {
      // Nothing to write on lead
      if (!jobsNeedSync) {
        return {
          stageUpdated: false,
          previousStage,
          newStage: effectiveStatus,
          stageToStore: target,
          tenantId,
          linkedJobsSynced: false,
        };
      }
    }

    const patch: Record<string, unknown> = {};
    if (statusNeedsSync) {
      patch.status = effectiveStatus;
    }
    if (linkedJobsSynced) {
      patch.linkedJobs = linked;
    }

    if (Object.keys(patch).length > 0) {
      await updateLead(tenantId, candidateId, patch as any);
    }

    // Sync job.candidates[] for the scoped job or all linked jobs
    const jobIds = new Set<string>();
    if (scopedJobId) {
      jobIds.add(scopedJobId);
    } else if (options?.primaryJobOnly && linked[0]?.jobId) {
      jobIds.add(String(linked[0].jobId));
    } else {
      for (const j of linked) {
        if (j?.jobId) jobIds.add(String(j.jobId));
      }
    }
    for (const jobId of jobIds) {
      try {
        await updateCandidateStageInJob(tenantId, jobId, {
          candidateId,
          stage: target as any,
        });
        linkedJobsSynced = true;
      } catch (syncErr) {
        console.warn(
          '[stage-sync] job.candidates stage sync failed',
          jobId,
          candidateId,
          syncErr
        );
      }
    }

    const didUpdate =
      statusNeedsSync || linkedJobsSynced || jobIds.size > 0;

    return {
      stageUpdated: didUpdate,
      previousStage,
      newStage: effectiveStatus,
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
  options?: { force?: boolean; jobId?: string | null }
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

  return setCandidatePipelineStage(candidateId, impliedStage, {
    jobId: options?.jobId || null,
  });
}
