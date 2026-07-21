/**
 * Job fit-score API
 * GET  /api/jobs/[id]/fit-score?candidateId=
 * POST /api/jobs/[id]/fit-score
 *   body: { candidateId } | { candidateIds: string[] } | { resumeText?, skills? }
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionTenantId } from "@/lib/server-auth";
import { getJobById } from "@/lib/db/repositories/job-repository";
import { getLeadById } from "@/lib/db/repositories/lead-repository";
import {
  scoreCandidateJobFit,
  extractSkillsFromText,
  type FitScoreResult,
  type FitCandidateInput,
} from "@/lib/ai/fit-score";
import { scoreCandidateJobFitWithOutcomes } from "@/lib/ai/outcome-rank";
import { getSkillsGraphFresh } from "@/lib/db/repositories/skills-graph-repository";
import {
  getItem,
  updateItem,
  jobsTable,
} from "@/lib/db/dynamodb";
import type { Job } from "@/lib/schemas/job";

export const dynamic = "force-dynamic";

function jobFitInput(job: {
  title?: string;
  description?: string;
  location?: string;
  salaryRange?: string;
}) {
  return {
    title: job.title || "",
    description: job.description || "",
    location: job.location || "",
    salaryRange: job.salaryRange || "",
  };
}

function leadToCandidateInput(lead: {
  skills?: string[];
  title?: string;
  summary?: string;
  experience?: FitCandidateInput["experience"];
  location?: string;
  notes?: string;
}): FitCandidateInput {
  return {
    skills: lead.skills,
    title: lead.title,
    summary: [lead.summary, lead.notes].filter(Boolean).join("\n"),
    experience: lead.experience,
    location: lead.location,
  };
}

/**
 * Optionally stamp fit fields onto job.candidates[] entry.
 * Extra fields are tolerated; never fail the request if write fails.
 */
async function tryStoreFitOnLinkedCandidate(
  tenantId: string,
  jobId: string,
  candidateId: string,
  result: FitScoreResult
): Promise<boolean> {
  try {
    const job = await getItem<Job & { candidates?: any[] }>(jobsTable, {
      tenant_id: tenantId,
      id: jobId,
    });
    if (!job) return false;
    const existing =
      (Array.isArray(job.candidates) && job.candidates) ||
      (Array.isArray((job as any).linkedCandidates) &&
        (job as any).linkedCandidates) ||
      [];
    const idx = existing.findIndex(
      (c: any) => c.candidateId === candidateId
    );
    if (idx < 0) return false;

    const next = existing.map((c: any, i: number) => {
      if (i !== idx) return c;
      return {
        ...c,
        fitScore: result.score,
        fitGrade: result.grade,
        fitReasons: result.reasons.slice(0, 6),
        fitScoredAt: new Date().toISOString(),
      };
    });

    await updateItem(
      jobsTable,
      { tenant_id: tenantId, id: jobId },
      "SET #candidates = :candidates, #modified_at = :modified_at",
      {
        ":candidates": next,
        ":modified_at": new Date().toISOString(),
      },
      {
        "#candidates": "candidates",
        "#modified_at": "modified_at",
      }
    );
    return true;
  } catch (err) {
    console.warn("[fit-score] store on link failed:", err);
    return false;
  }
}

async function scoreOne(
  tenantId: string,
  job: NonNullable<Awaited<ReturnType<typeof getJobById>>>,
  candidateId: string,
  opts?: { persist?: boolean; useOutcomes?: boolean }
): Promise<{
  candidateId: string;
  candidateName?: string;
  fit: FitScoreResult & {
    baseScore?: number;
    outcomeBoost?: number;
    rankedWithOutcomes?: boolean;
  };
  persisted?: boolean;
} | null> {
  const lead = await getLeadById(tenantId, candidateId);
  if (!lead) return null;

  let fit: FitScoreResult & {
    baseScore?: number;
    outcomeBoost?: number;
    rankedWithOutcomes?: boolean;
  };

  if (opts?.useOutcomes !== false) {
    try {
      const { graph } = await getSkillsGraphFresh(tenantId, { rebuild: false });
      fit = scoreCandidateJobFitWithOutcomes(
        leadToCandidateInput(lead as any),
        jobFitInput(job),
        graph
      );
    } catch {
      fit = scoreCandidateJobFit(
        leadToCandidateInput(lead as any),
        jobFitInput(job)
      );
    }
  } else {
    fit = scoreCandidateJobFit(
      leadToCandidateInput(lead as any),
      jobFitInput(job)
    );
  }

  let persisted = false;
  if (opts?.persist !== false) {
    persisted = await tryStoreFitOnLinkedCandidate(
      tenantId,
      job.id!,
      candidateId,
      fit
    );
  }
  return {
    candidateId,
    candidateName: lead.name,
    fit,
    persisted,
  };
}

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

    const result = await scoreOne(tenantId, job, candidateId);
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
    return NextResponse.json(
      { error: "Failed to compute fit score" },
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
      const fit = scoreCandidateJobFit(
        {
          skills,
          title: body.title ? String(body.title) : "",
          summary: resumeText,
          location: body.location ? String(body.location) : "",
          experience: Array.isArray(body.experience) ? body.experience : undefined,
        },
        jobFitInput(job)
      );
      return NextResponse.json({
        jobId,
        jobTitle: job.title,
        adHoc: true,
        fit,
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

    const unique = Array.from(new Set(ids)).slice(0, 100);
    const scores: Array<{
      candidateId: string;
      candidateName?: string;
      fit: FitScoreResult;
      persisted?: boolean;
    }> = [];
    const missing: string[] = [];

    for (const cid of unique) {
      const r = await scoreOne(tenantId, job, cid, { persist });
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
    return NextResponse.json(
      { error: "Failed to compute fit score" },
      { status: 500 }
    );
  }
}
