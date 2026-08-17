/**
 * One-click enroll: default (or specified) sequence + optional immediate first step.
 * POST { candidateId, jobId?, sequenceId?, runFirstStep? }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getSession,
  getSessionTenantId,
  getSessionUserId,
} from "@/lib/server-auth";
import {
  enrollCandidate,
  getOrCreateDefaultSequence,
  getSequence,
} from "@/lib/db/repositories/sequence-repository";
import { getLeadById } from "@/lib/db/repositories/lead-repository";
import { getJobById } from "@/lib/db/repositories/job-repository";
import { generateAiFirstDraft } from "@/lib/sequences/draft";
import { runEnrollmentStep } from "@/lib/sequences/runner";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const tenantId =
      request.headers.get("x-tenant-id") ||
      session?.tenantId ||
      (await getSessionTenantId());
    const userId =
      request.headers.get("x-user-id") ||
      session?.userId ||
      (await getSessionUserId());

    if (!tenantId || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const candidateId = String(
      body.candidateId || body.candidate_id || ""
    ).trim();
    const jobId = body.jobId || body.job_id
      ? String(body.jobId || body.job_id).trim()
      : undefined;
    const sequenceIdIn = body.sequenceId || body.sequence_id
      ? String(body.sequenceId || body.sequence_id).trim()
      : undefined;
    const runFirstStep =
      body.runFirstStep !== false && body.run_first_step !== false;

    if (!candidateId) {
      return NextResponse.json(
        { error: "candidateId is required" },
        { status: 400 }
      );
    }

    const candidate = await getLeadById(tenantId, candidateId);
    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    let sequence = sequenceIdIn
      ? await getSequence(tenantId, sequenceIdIn)
      : null;
    if (!sequence) {
      sequence = await getOrCreateDefaultSequence(tenantId, userId);
    }

    let jobTitle: string | undefined;
    let job = null as Awaited<ReturnType<typeof getJobById>>;
    if (jobId) {
      job = await getJobById(tenantId, jobId);
      jobTitle = job?.title;
    }

    const firstStep = sequence.steps?.[0];
    let drafts:
      | { stepId: string; subject?: string; body?: string }[]
      | undefined;

    if (firstStep) {
      try {
        const draft = await generateAiFirstDraft({
          candidate: {
            id: candidate.id,
            name: candidate.name,
            email: candidate.email,
            title: candidate.title,
            summary: candidate.summary,
            skills: candidate.skills,
            location: candidate.location,
          },
          job: job
            ? {
                id: job.id,
                title: job.title,
                companyName: job.companyName,
                description: job.description,
                location: job.location,
              }
            : null,
          sequence,
          step: firstStep,
          recruiterName: session?.email,
        });
        drafts = [
          {
            stepId: firstStep.id,
            subject: draft.subject,
            body: draft.body,
          },
        ];
      } catch {
        /* optional */
      }
    }

    const enrollment = await enrollCandidate(tenantId, {
      sequenceId: sequence.id,
      candidateId,
      candidateName: candidate.name,
      candidateEmail: candidate.email || undefined,
      jobId,
      jobTitle,
      drafts,
      enrolledByUserId: userId,
    });

    let runResult = null as Awaited<
      ReturnType<typeof runEnrollmentStep>
    > | null;

    // If first step is due now (delay 0), run immediately when requested
    const firstDelay = sequence.steps?.[0]?.delayDays ?? 0;
    if (runFirstStep && firstDelay === 0) {
      runResult = await runEnrollmentStep({
        tenantId,
        userId,
        enrollmentId: enrollment.id,
        force: true,
        recruiterName: session?.email,
      });
    }

    return NextResponse.json(
      {
        success: true,
        enrollment,
        sequence: {
          id: sequence.id,
          name: sequence.name,
        },
        firstStepRan: !!runResult?.success,
        runResult,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("[sequences/quick-enroll]", err);
    return NextResponse.json(
      { error: err?.message || "Quick enroll failed" },
      { status: 500 }
    );
  }
}
