/**
 * Shared persisted Fit Score runner used by the API and auto-score-on-link.
 */
import { getLeadById, updateLead } from "@/lib/db/repositories/lead-repository";
import {
  scoreCandidateJobFit,
  extractSkillsFromText,
  formatFitSummary,
  type FitScoreResult,
  type FitCandidateInput,
} from "@/lib/ai/fit-score";
import { getItem, updateItem, jobsTable } from "@/lib/db/dynamodb";
import type { Job } from "@/lib/schemas/job";
import { recordAiFitAssessed } from "@/lib/events/candidate-events";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { extractTextFromResumeBuffer } from "@/lib/candidates/resume-extract-server";
export function jobFitInput(job: {
  title?: string;
  description?: string;
  location?: string;
  salaryRange?: string;
  companyName?: string;
}) {
  return {
    title: job.title || "",
    description: job.description || "",
    location: job.location || "",
    salaryRange: job.salaryRange || "",
    companyName: job.companyName || "",
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
    const accessKeyId =
      process.env.AWS_ACCESS_KEY_ID || process.env.MY_AWS_ACCESS_KEY_ID;
    const secretAccessKey =
      process.env.AWS_SECRET_ACCESS_KEY || process.env.MY_AWS_SECRET_ACCESS_KEY;
    const client = new S3Client({
      region,
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
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

/** Don't let S3/pdf parsing block the whole fit request past this budget. */
const RESUME_LOAD_TIMEOUT_MS = 4000;

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function buildCandidateInput(lead: any): Promise<{
  input: FitCandidateInput;
  resumeUsed: boolean;
}> {
  // Prefer resume text for synonym matching, but never hang the request.
  // getSkillsGraphFresh rebuilds can also be slow â€” kept out of this path.
  const base = leadToCandidateInput(lead);
  const resumeText = await withTimeout(
    loadResumeTextForLead(lead),
    RESUME_LOAD_TIMEOUT_MS,
    ""
  );
  const resumeUsed = resumeText.length >= 40;
  if (resumeUsed) {
    return {
      input: leadToCandidateInput(lead, resumeText),
      resumeUsed: true,
    };
  }
  return { input: base, resumeUsed: false };
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
    fitScoringVersion: result.scoringVersion || "v2",
    fitVerify: result.verifyBeforeAdvancing,
    fitFactors: result.rubric,
  };
}

/**
 * Stamp fit fields onto job.candidates[] and dual-write lead.linkedJobs[].
 * Never fail the request if a side write fails â€” returns true if either side updated.
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

  // Dual-write: lead.linkedJobs[] for the same candidateâ†”job link
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

/** Fold recruiter notes into the candidate signal used by Domain/Tools scoring. */
export function applyRecruiterNotes(
  input: FitCandidateInput,
  recruiterNotes?: string
): FitCandidateInput {
  const notes = (recruiterNotes || "").trim();
  if (!notes) return input;
  const fromNotes = extractSkillsFromText(notes);
  const skills = Array.from(
    new Set([...(input.skills || []), ...fromNotes].map(String).filter(Boolean))
  );
  return {
    ...input,
    skills: skills.length ? skills : input.skills,
    summary: [input.summary, "", "Recruiter notes (manual match):", notes]
      .filter((x) => x !== undefined && x !== null)
      .join("\n"),
  };
}

export async function runPersistedFitScore(
  tenantId: string,
  job: Job & { id?: string; title?: string; candidates?: any[] },
  candidateId: string,
  opts?: {
    persist?: boolean;
    useOutcomes?: boolean;
    createdBy?: string;
    recruiterNotes?: string;
    /** Skip LLM work if this pair was scored within this window. */
    skipIfRecentMs?: number;
  }
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
  recruiterNotesUsed?: boolean;
} | null> {
  try {
    const lead = await getLeadById(tenantId, candidateId);
    if (!lead) return null;

    const recentMs = opts?.skipIfRecentMs || 0;
    if (recentMs > 0) {
      const fromJob = (Array.isArray(job.candidates) ? job.candidates : []).find(
        (c: any) => String(c?.candidateId) === String(candidateId)
      );
      const fromLead = Array.isArray((lead as any).linkedJobs)
        ? (lead as any).linkedJobs.find((j: any) => String(j?.jobId) === String(job.id))
        : null;
      const stamped = fromJob?.fitScoredAt || fromLead?.fitScoredAt;
      const existingScore = fromJob?.fitScore ?? fromLead?.fitScore;
      if (
        stamped &&
        typeof existingScore === "number" &&
        Date.now() - new Date(stamped).getTime() < recentMs
      ) {
        return {
          candidateId,
          candidateName: lead.name,
          fit: {
            score: existingScore,
            grade: fromJob?.fitGrade || fromLead?.fitGrade || "C",
            reasons: fromJob?.fitReasons || fromLead?.fitReasons || [],
            strengths: fromJob?.fitStrengths || fromLead?.fitStrengths || [],
            gaps: fromJob?.fitGaps || fromLead?.fitGaps || [],
            summary: fromJob?.fitSummary || fromLead?.fitSummary,
          } as FitScoreResult,
          persisted: true,
        };
      }
    }

    let resumeUsed = false;
    let candidateInput: FitCandidateInput;
    try {
      const built = await buildCandidateInput(lead as any);
      candidateInput = built.input;
      resumeUsed = built.resumeUsed;
    } catch (buildErr) {
      console.warn("[fit-score] buildCandidateInput failed:", buildErr);
      candidateInput = leadToCandidateInput(lead as any);
    }

    const notes = (opts?.recruiterNotes || "").trim();
    const recruiterNotesUsed = notes.length > 0;
    candidateInput = applyRecruiterNotes(candidateInput, notes);

    let fit: FitScoreResult & {
      baseScore?: number;
      outcomeBoost?: number;
      rankedWithOutcomes?: boolean;
      summary?: string;
    };

    try {
      fit = scoreCandidateJobFit(candidateInput, jobFitInput(job));
    } catch (scoreErr) {
      console.warn("[fit-score] scoring failed:", scoreErr);
      throw scoreErr;
    }

    try {
      fit.summary = formatFitSummary(fit);
    } catch {
      fit.summary = `Fit ${fit.score}/100 (${fit.grade})`;
    }
    if (recruiterNotesUsed) {
      fit.reasons = [
        "Recruiter notes included in Domain / Tools score",
        ...(fit.reasons || []),
      ].slice(0, 12);
      fit.summary = [
        fit.summary,
        "",
        "Recruiter notes considered:",
        notes.slice(0, 1500),
      ].join("\n");
    }
    if (resumeUsed) {
      fit.reasons = [
        "Scored using resume file text",
        ...(fit.reasons || []),
      ].slice(0, 12);
    }

    let persisted = false;
    if (opts?.persist !== false) {
      try {
        persisted = await tryStoreFitOnLinkedCandidate(
          tenantId,
          job.id!,
          job.title || "Job",
          candidateId,
          fit,
          opts?.createdBy || "system"
        );
      } catch (persistErr) {
        console.warn("[fit-score] persist failed (score still returned):", persistErr);
      }
    }
    return {
      candidateId,
      candidateName: lead.name,
      fit,
      persisted,
      resumeUsed,
      recruiterNotesUsed,
    };
  } catch (err) {
    console.error("[fit-score] scoreOne fatal:", err);
    throw err;
  }
}
