/**
 * Tenant-wide next actions (desk density).
 * GET /api/desk/next-actions?limit=20
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getSession,
  getSessionTenantId,
} from "@/lib/server-auth";
import { getAllJobs } from "@/lib/db/repositories/job-repository";
import { getLeadById } from "@/lib/db/repositories/lead-repository";
import { listEnrollments } from "@/lib/db/repositories/sequence-repository";
import { getSkillsGraphFresh } from "@/lib/db/repositories/skills-graph-repository";
import { scoreCandidateJobFitWithOutcomes } from "@/lib/ai/outcome-rank";
import {
  nextActionForCandidate,
  daysSinceStageUpdate,
  isSequenceNextAction,
  type CandidateActionInput,
  type NextAction,
} from "@/lib/ai/next-action";
import { normalizeJobStatus } from "@/lib/jobs/status";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const tenantId =
      request.headers.get("x-tenant-id") ||
      session?.tenantId ||
      (await getSessionTenantId());
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const scopedTenantId = tenantId;

    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get("limit") || "25", 10) || 25,
      50
    );

    const [jobs, enrollments, graphPack] = await Promise.all([
      getAllJobs(tenantId),
      listEnrollments(tenantId).catch(() => []),
      getSkillsGraphFresh(tenantId, { rebuild: false }).catch(() => ({
        graph: null as any,
      })),
    ]);
    const graph = graphPack?.graph ?? null;
    const now = Date.now();

    const openJobs = jobs.filter(
      (j) => normalizeJobStatus(j.status) === "Open"
    );

    // Cap jobs scanned for latency
    const jobSlice = openJobs.slice(0, 15);
    const actions: NextAction[] = [];
    const leadCache = new Map<string, Awaited<ReturnType<typeof getLeadById>>>();

    async function lead(id: string) {
      if (leadCache.has(id)) return leadCache.get(id)!;
      const l = await getLeadById(scopedTenantId, id).catch(() => null);
      leadCache.set(id, l);
      return l;
    }

    for (const job of jobSlice) {
      const linked = (job.candidates || []).slice(0, 20);
      for (const lc of linked) {
        const ld = await lead(lc.candidateId);
        const fit = scoreCandidateJobFitWithOutcomes(
          {
            skills: ld?.skills,
            title: ld?.title,
            summary: ld?.summary,
            experience: ld?.experience as any,
            location: ld?.location,
          },
          {
            title: job.title,
            description: job.description,
            location: job.location,
            salaryRange: (job as any).salaryRange,
          },
          graph
        );

        const activeEnroll = enrollments.find(
          (e) =>
            e.candidateId === lc.candidateId &&
            e.status === "active" &&
            (!e.jobId || e.jobId === job.id)
        );
        const due =
          !!activeEnroll &&
          !Number.isNaN(Date.parse(activeEnroll.nextRunAt)) &&
          Date.parse(activeEnroll.nextRunAt) <= now;

        // Prefer lead.linkedJobs / lead.status (what the candidate page updates)
        // over job.candidates which can lag if stage sync missed a write.
        const linkedForJob = Array.isArray((ld as any)?.linkedJobs)
          ? (ld as any).linkedJobs.find((j: any) => j?.jobId === job.id)
          : null;
        const stage =
          linkedForJob?.stage ||
          (ld as any)?.status ||
          lc.stage ||
          "sourced";

        const daysInStage = daysSinceStageUpdate(now, {
          stageUpdatedAt: (lc as any).stageUpdatedAt,
          linkedJobStageUpdatedAt: linkedForJob?.stageUpdatedAt,
          leadModifiedAt: (ld as any)?.modified_at || (ld as any)?.modifiedAt,
          dateApplied: (lc as any).dateApplied,
        });

        const input: CandidateActionInput = {
          candidateId: lc.candidateId,
          candidateName: lc.candidateName || ld?.name,
          stage,
          fit: { score: fit.score, grade: fit.grade },
          email: lc.candidateEmail || ld?.email,
          hasActiveSequence: !!activeEnroll,
          sequenceDue: due,
          sequenceEnrollmentId: activeEnroll?.id,
          daysInStage,
          lastActivityDays: daysInStage,
        };

        const action = nextActionForCandidate(input, job.id!);
        if (
          action.kind !== "none" &&
          action.priority >= 60 &&
          !isSequenceNextAction(action)
        ) {
          actions.push({
            ...action,
            meta: {
              ...action.meta,
              jobTitle: job.title,
              fitScore: fit.score,
              fitGrade: fit.grade,
            },
          });
        }
      }
    }

    actions.sort((a, b) => b.priority - a.priority);
    const top = actions.slice(0, limit);

    return NextResponse.json({
      actions: top,
      summary: {
        total: top.length,
        due: 0,
        enroll: 0,
        followUp: top.filter((a) => a.kind === "follow_up_task").length,
        stale: top.filter((a) => a.kind === "revive_stale").length,
        urgent: top.filter((a) => a.priority >= 85).length,
        jobsScanned: jobSlice.length,
      },
    });
  } catch (err: any) {
    console.error("[desk/next-actions]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load desk actions" },
      { status: 500 }
    );
  }
}
