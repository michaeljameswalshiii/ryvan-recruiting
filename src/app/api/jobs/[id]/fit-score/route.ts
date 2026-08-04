/**
 * Job fit-score API
 * GET  /api/jobs/[id]/fit-score?candidateId=
 * POST /api/jobs/[id]/fit-score
 *   body: { candidateId } | { candidateIds: string[] } | { resumeText?, skills? }
 *
 * On persist: stamps fit fields on job.candidates[] + lead.linkedJobs[] (dual-write)
 * and appends an activity note (type Other, systemKind ai_fit). No pipeline stage change.
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
  getLeadById,
  updateLead,
} from "@/lib/db/repositories/lead-repository";
import {
  scoreCandidateJobFit,
  extractSkillsFromText,
  formatFitSummary,
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
import { recordAiFitAssessed } from "@/lib/events/candidate-events";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { extractTextFromResumeBuffer } from "@/lib/candidates/resume-extract-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

function leadToCandidateInput(
  lead: {
    skills?: string[];
    title?: string;
    summary?: string;
    experience?: FitCandidateInput["experience"];
    education?: Array<Record<string, unknown> | string>;
    certifications?: string[];
    location?: string;
    notes?: string;
    company?: string;
  },
  extraResumeText?: string
): FitCandidateInput {
  // Pull as much free text as we have so near-match domain scoring can work
  // even when structured skills[] is sparse (common after resume upload).
  const eduText = Array.isArray(lead.education)
    ? lead.education
        .map((e) =>
          typeof e === "string"
            ? e
            : [e?.school, e?.degree, e?.field, e?.description]
                .filter(Boolean)
                .join(" ")
        )
        .join("\n")
    : "";
  const certText = Array.isArray(lead.certifications)
    ? lead.certifications.join(", ")
    : "";
  const summary = [
    lead.summary,
    lead.notes,
    lead.company,
    eduText,
    certText,
    extraResumeText,
  ]
    .filter(Boolean)
    .join("\n");

  const fromResume = extraResumeText
    ? extractSkillsFromText(extraResumeText)
    : [];
  const skills = Array.from(
    new Set([...(lead.skills || []), ...fromResume].map(String).filter(Boolean))
  );

  return {
    skills: skills.length ? skills : lead.skills,
    title: lead.title,
    summary,
    experience: lead.experience,
    location: lead.location,
  };
}

function candidateInputIsSparse(input: FitCandidateInput): boolean {
  const skillCount = Array.isArray(input.skills) ? input.skills.length : 0;
  const summaryLen = (input.summary || "").trim().length;
  const expCount = Array.isArray(input.experience) ? input.experience.length : 0;
  // Typical empty CRM profile after resume file attach without re-parse.
  // Any of these weak signals means we should try the resume file.
  return skillCount < 5 || summaryLen < 200 || expCount < 1;
}

function extractS3KeyFromUrlOrKey(raw: string): string {
  let s3Key = raw || "";
  if (s3Key.startsWith("http")) {
    try {
      const path = new URL(s3Key).pathname.replace(/^\//, "");
      const bucket = process.env.AWS_S3_BUCKET_NAME || "";
      s3Key =
        bucket && path.startsWith(bucket + "/")
          ? path.slice(bucket.length + 1)
          : path;
    } catch {
      /* keep */
    }
  }
  return s3Key;
}

async function streamToBuffer(
  body: AsyncIterable<Uint8Array> | ReadableStream | Blob | undefined
): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const anyBody = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
  };
  if (typeof anyBody.transformToByteArray === "function") {
    return Buffer.from(await anyBody.transformToByteArray());
  }
  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

/**
 * When profile skills/summary/experience are empty, load resume text from S3
 * so fit scoring can use the actual resume content (Theresa-style case).
 */
async function loadResumeTextForLead(lead: any): Promise<string> {
  try {
    const rawKey =
      lead.resume_key ||
      lead.resume_s3_key ||
      lead.resumeKey ||
      lead.resume_url ||
      lead.resumeUrl ||
      "";
    const s3Key = extractS3KeyFromUrlOrKey(String(rawKey || ""));
    if (!s3Key) return "";

    const bucket =
      process.env.AWS_S3_BUCKET_NAME ||
      process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME;
    if (!bucket) return "";

    const region =
      process.env.AWS_REGION ||
      process.env.NEXT_PUBLIC_AWS_REGION ||
      "us-east-1";
    const client = new S3Client({ region });
    const obj = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: s3Key })
    );
    const buffer = await streamToBuffer(obj.Body as any);
    if (!buffer.length) return "";

    const fileName =
      lead.resume_file_name ||
      lead.resumeFileName ||
      s3Key.split("/").pop() ||
      "resume.pdf";
    const { text } = await extractTextFromResumeBuffer(buffer, String(fileName));
    return (text || "").trim().slice(0, 20000);
  } catch (err) {
    console.warn("[fit-score] resume text load failed:", err);
    return "";
  }
}

async function buildCandidateInput(lead: any): Promise<{
  input: FitCandidateInput;
  resumeUsed: boolean;
}> {
  let input = leadToCandidateInput(lead);
  let resumeUsed = false;
  if (candidateInputIsSparse(input)) {
    const resumeText = await loadResumeTextForLead(lead);
    if (resumeText.length >= 40) {
      input = leadToCandidateInput(lead, resumeText);
      resumeUsed = true;
    }
  }
  return { input, resumeUsed };
}

/** Shared fit fields written to both sides of the dual-write link. */
function fitLinkFields(result: FitScoreResult, scoredAt: string) {
  return {
    fitScore: result.score,
    fitGrade: result.grade,
    fitDomainScore: result.domainFit?.score,
    fitDomainGrade: result.domainFit?.grade,
    fitToolScore: result.toolReadiness?.score,
    fitToolGrade: result.toolReadiness?.grade,
    fitToolApplicable: result.toolReadiness?.applicable !== false,
    fitReasons: result.reasons.slice(0, 6),
    fitStrengths: result.strengths.slice(0, 6),
    fitGaps: result.gaps.slice(0, 6),
    fitSummary: formatFitSummary(result),
    fitScoredAt: scoredAt,
  };
}

/**
 * Stamp fit fields onto job.candidates[] and dual-write lead.linkedJobs[].
 * Never fail the request if a side write fails — returns true if either side updated.
 */
async function tryStoreFitOnLinkedCandidate(
  tenantId: string,
  jobId: string,
  jobTitle: string,
  candidateId: string,
  result: FitScoreResult,
  createdBy: string
): Promise<boolean> {
  const scoredAt = new Date().toISOString();
  const fields = fitLinkFields(result, scoredAt);
  let jobStored = false;

  try {
    const job = await getItem<Job & { candidates?: any[] }>(jobsTable, {
      tenant_id: tenantId,
      id: jobId,
    });
    if (job) {
      const existing =
        (Array.isArray(job.candidates) && job.candidates) ||
        (Array.isArray((job as any).linkedCandidates) &&
          (job as any).linkedCandidates) ||
        [];
      const idx = existing.findIndex(
        (c: any) => c.candidateId === candidateId
      );
      if (idx >= 0) {
        const next = existing.map((c: any, i: number) => {
          if (i !== idx) return c;
          return { ...c, ...fields };
        });

        await updateItem(
          jobsTable,
          { tenant_id: tenantId, id: jobId },
          "SET #candidates = :candidates, #modified_at = :modified_at",
          {
            ":candidates": next,
            ":modified_at": scoredAt,
          },
          {
            "#candidates": "candidates",
            "#modified_at": "modified_at",
          }
        );
        jobStored = true;
      }
    }
  } catch (err) {
    console.warn("[fit-score] store on job.candidates failed:", err);
  }

  // Dual-write: lead.linkedJobs[] for the same candidate↔job link
  let leadStored = false;
  try {
    const lead = await getLeadById(tenantId, candidateId);
    if (lead) {
      const linked = Array.isArray((lead as any).linkedJobs)
        ? [...(lead as any).linkedJobs]
        : [];
      const lidx = linked.findIndex((j: any) => j?.jobId === jobId);
      if (lidx >= 0) {
        linked[lidx] = { ...linked[lidx], ...fields };
        await updateLead(tenantId, candidateId, {
          linkedJobs: linked as any,
        });
        leadStored = true;
      }
    }
  } catch (err) {
    console.warn("[fit-score] dual-write lead.linkedJobs failed:", err);
  }

  const anyStored = jobStored || leadStored;

  // Activity history (append-only); does not change pipeline stage
  if (anyStored) {
    try {
      await recordAiFitAssessed(
        candidateId,
        jobId,
        jobTitle || "Job",
        createdBy,
        {
          score: result.score,
          grade: result.grade,
          domainFit: result.domainFit,
          toolReadiness: result.toolReadiness,
          summary: fields.fitSummary,
          strengths: result.strengths,
          gaps: result.gaps,
          reasons: result.reasons,
        }
      );
    } catch (err) {
      console.warn("[fit-score] activity note failed:", err);
    }
  }

  return anyStored;
}

async function scoreOne(
  tenantId: string,
  job: NonNullable<Awaited<ReturnType<typeof getJobById>>>,
  candidateId: string,
  opts?: { persist?: boolean; useOutcomes?: boolean; createdBy?: string }
): Promise<{
  candidateId: string;
  candidateName?: string;
  fit: FitScoreResult & {
    baseScore?: number;
    outcomeBoost?: number;
    rankedWithOutcomes?: boolean;
    summary?: string;
  };
  persisted?: boolean;
  resumeUsed?: boolean;
} | null> {
  const lead = await getLeadById(tenantId, candidateId);
  if (!lead) return null;

  const { input: candidateInput, resumeUsed } = await buildCandidateInput(
    lead as any
  );

  let fit: FitScoreResult & {
    baseScore?: number;
    outcomeBoost?: number;
    rankedWithOutcomes?: boolean;
    summary?: string;
  };

  if (opts?.useOutcomes !== false) {
    try {
      const { graph } = await getSkillsGraphFresh(tenantId, { rebuild: false });
      fit = scoreCandidateJobFitWithOutcomes(
        candidateInput,
        jobFitInput(job),
        graph
      );
    } catch {
      fit = scoreCandidateJobFit(candidateInput, jobFitInput(job));
    }
  } else {
    fit = scoreCandidateJobFit(candidateInput, jobFitInput(job));
  }

  fit.summary = formatFitSummary(fit);
  if (resumeUsed) {
    fit.reasons = [
      "Scored using resume file text (profile skills/summary were sparse)",
      ...fit.reasons,
    ].slice(0, 12);
  }

  let persisted = false;
  if (opts?.persist !== false) {
    persisted = await tryStoreFitOnLinkedCandidate(
      tenantId,
      job.id!,
      job.title || "Job",
      candidateId,
      fit,
      opts?.createdBy || "system"
    );
  }
  return {
    candidateId,
    candidateName: lead.name,
    fit,
    persisted,
    resumeUsed,
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
    const createdBy =
      (await getSessionUserEmail()) || "system";
    const scores: Array<{
      candidateId: string;
      candidateName?: string;
      fit: FitScoreResult;
      persisted?: boolean;
    }> = [];
    const missing: string[] = [];

    for (const cid of unique) {
      const r = await scoreOne(tenantId, job, cid, {
        persist,
        createdBy,
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
    return NextResponse.json(
      { error: "Failed to compute fit score" },
      { status: 500 }
    );
  }
}
