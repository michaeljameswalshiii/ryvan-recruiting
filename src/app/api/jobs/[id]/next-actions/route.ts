/**
 * Next best actions for candidates on a job (dense desk UI).
 * GET /api/jobs/[id]/next-actions
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getSession,
  getSessionTenantId,
} from "@/lib/server-auth";
import { getJobById } from "@/lib/db/repositories/job-repository";
import { getLeadById } from "@/lib/db/repositories/lead-repository";
import { listEnrollments } from "@/lib/db/repositories/sequence-repository";
import { getSkillsGraphFresh } from "@/lib/db/repositories/skills-graph-repository";
import { scoreCandidateJobFitWithOutcomes } from "@/lib/ai/outcome-rank";
import {
  nextActionsForJob,
  jobLevelNextAction,
  daysSinceStageUpdate,
  type CandidateActionInput,
} from "@/lib/ai/next-action";
import { isJobOpenForCareers, normalizeJobStatus } from "@/lib/jobs/status";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await context.params;
    const session = await getSession();
    const tenantId =
      request.headers.get("x-tenant-id") ||
      session?.tenantId ||
      (await getSessionTenantId());

    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const job = await getJobById(tenantId, jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const { graph } = await getSkillsGraphFresh(tenantId, {
      rebuild: false,
    }).catch(() => ({ graph: null as any }));

    const enrollments = await listEnrollments(tenantId).catch(() => []);
    const now = Date.now();

    const linked = job.candidates || [];
    const inputs: CandidateActionInput[] = [];

    for (const lc of linked) {
      const lead = await getLeadById(tenantId, lc.candidateId).catch(
        () => null
      );
      const fit = scoreCandidateJobFitWithOutcomes(
        {
          skills: lead?.skills,
          title: lead?.title,
          summary: lead?.summary,
          experience: lead?.experience as any,
          location: lead?.location,
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
          (!e.jobId || e.jobId === jobId)
      );
      const due =
        !!activeEnroll &&
        !Number.isNaN(Date.parse(activeEnroll.nextRunAt)) &&
        Date.parse(activeEnroll.nextRunAt) <= now;

      const linkedForJob = Array.isArray((lead as any)?.linkedJobs)
        ? (lead as any).linkedJobs.find((j: any) => j?.jobId === jobId)
        : null;
      const stage =
        linkedForJob?.stage ||
        (lead as any)?.status ||
        lc.stage ||
        "sourced";

      const daysInStage = daysSinceStageUpdate(now, {
        stageUpdatedAt: (lc as any).stageUpdatedAt,
        linkedJobStageUpdatedAt: linkedForJob?.stageUpdatedAt,
        leadModifiedAt: (lead as any)?.modified_at || (lead as any)?.modifiedAt,
        dateApplied: (lc as any).dateApplied,
      });

      inputs.push({
        candidateId: lc.candidateId,
        candidateName: lc.candidateName || lead?.name,
        stage,
        fit: { score: fit.score, grade: fit.grade },
        email: lc.candidateEmail || lead?.email,
        hasActiveSequence: !!activeEnroll,
        sequenceDue: due,
        sequenceEnrollmentId: activeEnroll?.id,
        daysInStage,
        lastActivityDays: daysInStage,
      });
    }

    const { actions, summary } = nextActionsForJob(jobId, inputs, {
      max: 40,
    });
    const jobAction = jobLevelNextAction({
      jobId,
      jobTitle: job.title,
      candidateCount: linked.length,
      openStatus: normalizeJobStatus(job.status) === "Open",
    });

    const fits = inputs.map((i) => ({
      candidateId: i.candidateId,
      candidateName: i.candidateName,
      stage: i.stage,
      fitScore: i.fit?.score,
      fitGrade: i.fit?.grade,
      nextAction: actions.find((a) => a.candidateId === i.candidateId) || null,
    }));

    return NextResponse.json({
      jobId,
      jobTitle: job.title,
      summary,
      jobAction,
      actions,
      candidates: fits,
      outcomeRanking: true,
    });
  } catch (err: any) {
    console.error("[jobs/next-actions]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to compute next actions" },
      { status: 500 }
    );
  }
}
