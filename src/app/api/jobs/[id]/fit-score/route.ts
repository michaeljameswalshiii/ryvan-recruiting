/**
 * Job fit-score API
 * GET  /api/jobs/[id]/fit-score?candidateId=
 * POST /api/jobs/[id]/fit-score
 *   body: { candidateId } | { candidateIds: string[] } | { resumeText?, skills? }
 *   optional: recruiterNotes â€” free text folded into candidate signal (manual match)
 *
 * On persist: stamps fit fields on job.candidates[] + lead.linkedJobs[] (dual-write)
 * and appends an activity note (type AI Review, systemKind ai_fit). No pipeline stage change.
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getSessionTenantId,
  getSessionUserEmail,
} from "@/lib/server-auth";
import { getJobById } from "@/lib/db/repositories/job-repository";
import {
  scoreCandidateJobFit,
  extractSkillsFromText,
  formatFitSummary,
  type FitScoreResult,
  type FitCandidateInput,
} from "@/lib/ai/fit-score";
import {
  applyRecruiterNotes,
  jobFitInput,
  runPersistedFitScore,
} from "@/lib/ai/run-persisted-fit-score";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const scoreOne = runPersistedFitScore;

/**
 * GET /api/jobs/[id]/fit-score?candidateId=
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json(
        { error: "Unauthorized - no tenant found" },
        { status: 401 }
      );
    }

    const candidateId =
      request.nextUrl.searchParams.get("candidateId") ||
      request.nextUrl.searchParams.get("candidate_id") ||
      "";

    if (!candidateId) {
      return NextResponse.json(
        { error: "candidateId query param is required" },
        { status: 400 }
      );
    }

    const job = await getJobById(tenantId, jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const createdBy =
      (await getSessionUserEmail()) || "system";
    const result = await scoreOne(tenantId, job, candidateId, {
      createdBy,
    });
    if (!result) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      jobId,
      jobTitle: job.title,
      ...result,
    });
  } catch (error) {
    console.error("[fit-score] GET error:", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to compute fit score";
    return NextResponse.json(
      { error: message, code: "FIT_SCORE_FAILED" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/jobs/[id]/fit-score
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json(
        { error: "Unauthorized - no tenant found" },
        { status: 401 }
      );
    }

    const job = await getJobById(tenantId, jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const persist = body.persist !== false;
    const recruiterNotes = String(
      body.recruiterNotes || body.recruiter_notes || body.notes || ""
    ).trim();

    // Ad-hoc score from resume text / skills (no candidate record)
    if (
      body.resumeText ||
      body.resume_text ||
      (Array.isArray(body.skills) && !body.candidateId && !body.candidateIds)
    ) {
      const resumeText = String(body.resumeText || body.resume_text || "");
      const skills: string[] = Array.isArray(body.skills)
        ? body.skills.map(String)
        : extractSkillsFromText(resumeText);
      const baseInput: FitCandidateInput = {
        skills,
        title: body.title ? String(body.title) : "",
        summary: resumeText,
        location: body.location ? String(body.location) : "",
        experience: Array.isArray(body.experience) ? body.experience : undefined,
      };
      const fit = scoreCandidateJobFit(
        applyRecruiterNotes(baseInput, recruiterNotes),
        jobFitInput(job)
      );
      if (recruiterNotes) {
        fit.reasons = [
          "Recruiter notes included in Domain / Tools score",
          ...fit.reasons,
        ].slice(0, 12);
      }
      return NextResponse.json({
        jobId,
        jobTitle: job.title,
        adHoc: true,
        recruiterNotesUsed: !!recruiterNotes,
        fit: {
          ...fit,
          summary: formatFitSummary(fit),
        },
      });
    }

    // Batch
    const ids: string[] = Array.isArray(body.candidateIds)
      ? body.candidateIds.map(String).filter(Boolean)
      : body.candidateId
        ? [String(body.candidateId)]
        : body.candidate_id
          ? [String(body.candidate_id)]
          : [];

    // If no ids, score all linked candidates on the job
    if (ids.length === 0) {
      const linked =
        (Array.isArray(job.candidates) && job.candidates) ||
        (Array.isArray((job as any).linkedCandidates) &&
          (job as any).linkedCandidates) ||
        [];
      for (const c of linked) {
        if (c?.candidateId) ids.push(String(c.candidateId));
      }
    }

    if (ids.length === 0) {
      return NextResponse.json(
        {
          error:
            "Provide candidateId, candidateIds, or resumeText/skills; or link candidates to the job first",
        },
        { status: 400 }
      );
    }

    // Manual match with notes is single-candidate only (clearer UX)
    const unique = Array.from(new Set(ids)).slice(
      0,
      recruiterNotes ? 1 : 100
    );
    const createdBy =
      (await getSessionUserEmail()) || "system";
    const scores: Array<{
      candidateId: string;
      candidateName?: string;
      fit: FitScoreResult;
      persisted?: boolean;
      recruiterNotesUsed?: boolean;
    }> = [];
    const missing: string[] = [];

    for (const cid of unique) {
      const r = await scoreOne(tenantId, job, cid, {
        persist,
        createdBy,
        recruiterNotes: recruiterNotes || undefined,
      });
      if (r) scores.push(r);
      else missing.push(cid);
    }

    return NextResponse.json({
      jobId,
      jobTitle: job.title,
      count: scores.length,
      scores,
      missing: missing.length ? missing : undefined,
    });
  } catch (error) {
    console.error("[fit-score] POST error:", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to compute fit score";
    return NextResponse.json(
      { error: message, code: "FIT_SCORE_FAILED" },
      { status: 500 }
    );
  }
}
