/**
 * Public careers apply — creates candidate + links to open job,
 * OR general talent-network submission (no job).
 *
 * POST /api/public/careers/apply
 * Content-Type: multipart/form-data (preferred) or application/json
 *
 * Job apply fields:
 *   jobId, tenant, name, email, resume (PDF/DOCX required),
 *   phone?, message?, linkedinUrl?, website? (honeypot)
 *
 * Talent network (mode=talent_network | general):
 *   tenant, name, email, resume required; jobId omitted
 *   interests? (role preferences free text), message?, phone?, linkedinUrl?
 */

import { NextRequest } from "next/server";

export const maxDuration = 60;
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  getJobById,
  linkCandidateToJob,
  updateCandidateStageInJob,
} from "@/lib/db/repositories/job-repository";
import { createLead } from "@/lib/db/repositories/lead-repository";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  assertCareersAccess,
  clientIp,
  isJobListedOnWebsite,
  jsonWithCors,
  optionsCors,
  resolveCareersTenant,
} from "@/lib/careers/public";
import { addNoteToCandidate } from "@/lib/events/candidate-events";
import { parseResumeBuffer } from "@/lib/candidates/resume-extract-server";
import {
  evaluateScreenAnswers,
  formatAnswersForNote,
} from "@/lib/careers/screen-bot";
import {
  scoreCandidateJobFit,
  formatFitSummary,
  type FitScoreResult,
} from "@/lib/ai/fit-score";
import { getItem, updateItem, jobsTable } from "@/lib/db/dynamodb";

const MAX_RESUME_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXT = [".pdf", ".docx", ".doc"];
const ALLOWED_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/octet-stream", // some browsers
];

export async function OPTIONS(request: NextRequest) {
  return optionsCors(request);
}

async function parseBody(request: NextRequest): Promise<{
  fields: Record<string, string>;
  resumeFile: File | null;
}> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const fields: Record<string, string> = {};
    let resumeFile: File | null = null;

    for (const [key, value] of form.entries()) {
      if (value instanceof File) {
        if (key === "resume" || key === "file") {
          resumeFile = value.size > 0 ? value : null;
        }
      } else {
        fields[key] = String(value);
      }
    }
    return { fields, resumeFile };
  }

  const body = await request.json().catch(() => ({}));
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (v !== undefined && v !== null) fields[k] = String(v);
  }
  return { fields, resumeFile: null };
}

function isAllowedResume(file: File): boolean {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  const extOk = ALLOWED_EXT.some((e) => name.endsWith(e));
  const mimeOk = !type || ALLOWED_MIME.includes(type);
  return extOk && mimeOk;
}

async function uploadResumeToS3(
  file: File,
  tenantId: string
): Promise<{ s3Key: string; fileName: string }> {
  const bucket =
    process.env.AWS_S3_BUCKET_NAME ||
    process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME;
  if (!bucket) {
    throw new Error("Resume storage is not configured (AWS_S3_BUCKET_NAME)");
  }

  const region =
    process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1";
  const client = new S3Client({
    region,
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });

  const timestamp = Date.now();
  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const s3Key = `tenants/${tenantId}/careers-resumes/${timestamp}-${sanitized}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: buffer,
      ContentType: file.type || "application/octet-stream",
    })
  );

  return { s3Key, fileName: file.name };
}

function normalizeLinkedIn(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^linkedin\.com\//i.test(s) || /^www\.linkedin\.com\//i.test(s)) {
    return `https://${s.replace(/^www\./i, "www.")}`;
  }
  if (/^[\w-]+$/.test(s)) {
    return `https://www.linkedin.com/in/${s}`;
  }
  return s;
}

export async function POST(request: NextRequest) {
  try {
    const auth = assertCareersAccess(request);
    if (!auth.ok) return auth.response;

    const rl = checkRateLimit(`careers-apply:${clientIp(request)}`);
    if (!rl.allowed) {
      return jsonWithCors(
        request,
        { error: "Too many applications. Please try again later." },
        429
      );
    }

    const { fields, resumeFile } = await parseBody(request);

    const honeypot = String(
      fields.website || fields.company_url || ""
    ).trim();
    if (honeypot) {
      return jsonWithCors(request, { success: true });
    }

    const modeRaw = String(
      fields.mode || fields.applicationType || ""
    )
      .trim()
      .toLowerCase();
    const isTalentNetwork =
      modeRaw === "talent_network" ||
      modeRaw === "talent-network" ||
      modeRaw === "general" ||
      modeRaw === "future" ||
      String(fields.talentNetwork || "").toLowerCase() === "true" ||
      String(fields.general || "").toLowerCase() === "true";

    const jobId = String(fields.jobId || fields.job_id || "").trim();
    const name = String(fields.name || "").trim();
    const email = String(fields.email || "").trim();
    const phone = String(fields.phone || "").trim();
    const message = String(
      fields.message || fields.coverLetter || ""
    ).trim();
    const interests = String(
      fields.interests ||
        fields.interest ||
        fields.rolePreferences ||
        fields.preferences ||
        ""
    ).trim();
    const linkedinUrl = normalizeLinkedIn(
      String(fields.linkedinUrl || fields.linkedin_url || fields.linkedin || "")
    );
    const resumeUrlField = String(
      fields.resumeUrl || fields.resume_url || ""
    ).trim();
    const tenantParam = fields.tenant ? String(fields.tenant) : null;

    if (!name || !email) {
      return jsonWithCors(
        request,
        { error: "name and email are required" },
        400
      );
    }

    if (!isTalentNetwork && !jobId) {
      return jsonWithCors(
        request,
        { error: "jobId is required (or set mode=talent_network)" },
        400
      );
    }

    if (!tenantParam) {
      return jsonWithCors(
        request,
        { error: "tenant (careers slug) is required" },
        400
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonWithCors(request, { error: "Invalid email address" }, 400);
    }

    if (
      name.length > 100 ||
      email.length > 200 ||
      message.length > 2000 ||
      interests.length > 1000
    ) {
      return jsonWithCors(request, { error: "Input too long" }, 400);
    }

    if (linkedinUrl && linkedinUrl.length > 300) {
      return jsonWithCors(request, { error: "LinkedIn URL too long" }, 400);
    }

    if (
      linkedinUrl &&
      !/^https?:\/\/(www\.)?linkedin\.com\//i.test(linkedinUrl) &&
      !linkedinUrl.includes("linkedin.com")
    ) {
      if (!/^https?:\/\//i.test(linkedinUrl)) {
        return jsonWithCors(
          request,
          {
            error:
              "LinkedIn should be a profile URL (e.g. https://www.linkedin.com/in/yourname)",
          },
          400
        );
      }
    }

    const ctx = await resolveCareersTenant(tenantParam);
    if (!ctx) {
      return jsonWithCors(
        request,
        { error: "Unknown careers tenant. Check the careers URL slug." },
        404
      );
    }
    const tenantId = ctx.tenantId;

    let job: Awaited<ReturnType<typeof getJobById>> = null;
    if (!isTalentNetwork) {
      job = await getJobById(tenantId, jobId);
      if (!job || !isJobListedOnWebsite(job)) {
        return jsonWithCors(
          request,
          {
            error:
              "This job is not open for applications on the careers site",
          },
          404
        );
      }
    }

    // Resume file is required for all public careers submissions
    if (!resumeFile) {
      return jsonWithCors(
        request,
        {
          error:
            "A resume is required. Please upload a PDF or Word (.docx) file.",
        },
        400
      );
    }

    let resumeUrl = resumeUrlField;
    let resumeFileName = "";
    let parsedFromResume: Awaited<
      ReturnType<typeof parseResumeBuffer>
    >["parsed"] | null = null;

    if (resumeFile.size > MAX_RESUME_BYTES) {
      return jsonWithCors(
        request,
        { error: "Resume file too large. Maximum size is 10MB." },
        400
      );
    }
    if (!isAllowedResume(resumeFile)) {
      return jsonWithCors(
        request,
        {
          error:
            "Unsupported resume type. Please upload a PDF or Word (.docx) file.",
        },
        400
      );
    }
    try {
      const buffer = Buffer.from(await resumeFile.arrayBuffer());
      try {
        const result = await parseResumeBuffer(buffer, resumeFile.name);
        parsedFromResume = result.parsed;
      } catch (parseErr) {
        console.warn("[careers/apply] resume parse failed:", parseErr);
      }

      const fileForUpload = new File([buffer], resumeFile.name, {
        type: resumeFile.type || "application/octet-stream",
      });
      const uploaded = await uploadResumeToS3(fileForUpload, tenantId);
      resumeUrl = uploaded.s3Key;
      resumeFileName = uploaded.fileName;
    } catch (uploadErr) {
      console.error("[careers/apply] resume upload failed:", uploadErr);
      return jsonWithCors(
        request,
        {
          error:
            uploadErr instanceof Error
              ? uploadErr.message
              : "Failed to upload resume. Try again or use a smaller PDF.",
        },
        500
      );
    }

    // Prefer applicant form values; fill gaps from resume parse
    const p = parsedFromResume;
    const finalPhone = phone || p?.phone || "";
    const finalLinkedIn = linkedinUrl || p?.linkedin || "";
    const professionalTitle = (p?.title || "").slice(0, 100);
    const finalLocation = (
      p?.location ||
      (job as any)?.location ||
      ""
    ).slice(0, 200);
    const finalSummary = (p?.summary || "").slice(0, 2000);
    const finalSkills = p?.skills?.length ? p.skills.slice(0, 30) : undefined;
    const finalExperience = p?.experience?.length
      ? p.experience.slice(0, 12)
      : undefined;
    const finalEducation = p?.education?.length
      ? p.education.slice(0, 8)
      : undefined;
    const finalCerts = p?.certifications?.length
      ? p.certifications.slice(0, 15)
      : undefined;

    const source = isTalentNetwork
      ? "website-careers-talent-network"
      : "website-careers";

    const notes = (
      isTalentNetwork
        ? [
            "Joined talent network via public careers page (future opportunities)",
            interests
              ? `Interest / role preferences:\n${interests}`
              : "",
            message ? `Message:\n${message}` : "",
            finalLinkedIn ? `LinkedIn: ${finalLinkedIn}` : "",
            resumeFileName
              ? `Resume file: ${resumeFileName}`
              : resumeUrl
                ? `Resume stored: ${resumeUrl}`
                : "",
            finalSummary
              ? `Resume summary:\n${finalSummary.slice(0, 500)}`
              : "",
            finalSkills?.length ? `Skills: ${finalSkills.join(", ")}` : "",
          ]
        : [
            `Applied via public careers page for: ${job!.title}`,
            message ? `Message:\n${message}` : "",
            finalLinkedIn ? `LinkedIn: ${finalLinkedIn}` : "",
            resumeFileName
              ? `Resume file: ${resumeFileName}`
              : resumeUrl
                ? `Resume stored: ${resumeUrl}`
                : "",
            finalSummary
              ? `Resume summary:\n${finalSummary.slice(0, 500)}`
              : "",
            finalSkills?.length ? `Skills: ${finalSkills.join(", ")}` : "",
          ]
    )
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 2000);

    const lead = await createLead(tenantId, {
      name,
      email,
      phone: finalPhone,
      title:
        professionalTitle ||
        (!isTalentNetwork ? job?.title || "" : "") ||
        "",
      // Job applications → Applied; talent network joins stay Sourced
      status: isTalentNetwork ? "sourced" : "applied",
      source,
      notes,
      resume_url: resumeUrl || "",
      resume_key: resumeUrl || "",
      resume_s3_key: resumeUrl || "",
      resume_file_name: resumeFileName || "",
      linkedin_url: finalLinkedIn || "",
      location: finalLocation,
      summary: finalSummary || undefined,
      skills: finalSkills,
      experience: finalExperience as any,
      education: finalEducation as any,
      certifications: finalCerts,
      salary_requirements: p?.salaryRequirements || undefined,
    } as any);

    // Pre-screen evaluation (never fail the apply solely due to screen bugs)
    let screenResult: {
      pass: boolean;
      score: number;
      summary: string;
      answersFormatted: string;
    } | null = null;
    let parsedScreenAnswers: Record<string, string> = {};

    if (!isTalentNetwork && job) {
      try {
        const rawScreen = String(
          fields.screenAnswers || fields.screen_answers || ""
        ).trim();
        if (rawScreen) {
          try {
            const parsed = JSON.parse(rawScreen);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              parsedScreenAnswers = Object.fromEntries(
                Object.entries(parsed).map(([k, v]) => [k, String(v ?? "")])
              );
            }
          } catch {
            /* ignore bad JSON */
          }
        }

        const questions = (job as { preScreenQuestions?: unknown })
          .preScreenQuestions;
        if (
          Array.isArray(questions) &&
          questions.length > 0 &&
          Object.keys(parsedScreenAnswers).length > 0
        ) {
          screenResult = evaluateScreenAnswers(
            questions as any,
            parsedScreenAnswers
          );
        } else if (Array.isArray(questions) && questions.length > 0) {
          // Questions configured but no answers posted
          screenResult = evaluateScreenAnswers(
            questions as any,
            parsedScreenAnswers
          );
        }
      } catch (screenErr) {
        console.warn("[careers/apply] screen eval warning:", screenErr);
        screenResult = null;
      }
    }

    if (lead.id) {
      try {
        const activityText = isTalentNetwork
          ? [
              "Joined talent network (future opportunities)",
              interests ? `Interests / role preferences:\n${interests}` : "",
              message ? `Message:\n${message}` : "",
              linkedinUrl ? `LinkedIn: ${linkedinUrl}` : "",
              resumeFileName ? `Resume attached: ${resumeFileName}` : "",
            ]
              .filter(Boolean)
              .join("\n\n")
          : [
              message
                ? `Careers application message for "${job!.title}":\n\n${message}`
                : `Applied via careers site for: ${job!.title}`,
              linkedinUrl ? `LinkedIn: ${linkedinUrl}` : "",
              resumeFileName ? `Resume attached: ${resumeFileName}` : "",
            ]
              .filter(Boolean)
              .join("\n");

        await addNoteToCandidate(lead.id, activityText, source, {
          noteType: isTalentNetwork ? "Talent network" : "Applied",
          stage: isTalentNetwork ? "sourced" : "applied",
          ...(isTalentNetwork
            ? { talentNetwork: true, interests: interests || undefined }
            : { jobId, jobTitle: job!.title }),
        });
      } catch (noteErr) {
        console.warn("[careers/apply] activity note warning:", noteErr);
      }

      // Pre-screen Q&A note
      if (screenResult && lead.id) {
        try {
          const qaBody =
            screenResult.answersFormatted ||
            formatAnswersForNote(
              ((job as any)?.preScreenQuestions || []) as any,
              parsedScreenAnswers
            );
          const noteBody = [
            screenResult.pass
              ? `Pre-screen: PASS (score ${screenResult.score}/100)`
              : `Pre-screen: FLAGS (score ${screenResult.score}/100)`,
            screenResult.summary,
            qaBody,
          ]
            .filter(Boolean)
            .join("\n\n")
            .slice(0, 4000);

          await addNoteToCandidate(lead.id, noteBody, source, {
            noteType: screenResult.pass
              ? "Pre-screen pass"
              : "Pre-screen flags",
            stage: screenResult.pass ? "pre_screened" : "applied",
            jobId,
            jobTitle: job?.title,
            screenPass: screenResult.pass,
            screenScore: screenResult.score,
          });
        } catch (screenNoteErr) {
          console.warn("[careers/apply] screen note warning:", screenNoteErr);
        }
      }
    }

    if (!isTalentNetwork && job) {
      const hasAnswers = Object.keys(parsedScreenAnswers).length > 0;
      const linkStage =
        screenResult?.pass && hasAnswers ? "pre_screened" : "applied";
      try {
        await linkCandidateToJob(tenantId, jobId, {
          candidateId: lead.id!,
          candidateName: lead.name,
          candidateEmail: lead.email || email,
          stage: linkStage,
          notes: message
            ? message.slice(0, 1000)
            : screenResult && !screenResult.pass
              ? "Applied via careers site (screen flags)"
              : "Applied via careers site",
        });
      } catch (linkErr) {
        console.warn("[careers/apply] link warning:", linkErr);
        // If already linked, still try stage update on pass
        if (screenResult?.pass && hasAnswers && lead.id) {
          try {
            await updateCandidateStageInJob(tenantId, jobId, {
              candidateId: lead.id,
              stage: "pre_screened" as any,
              notes: "Pre-screen passed via careers apply",
            });
          } catch {
            /* ignore */
          }
        }
      }
    }

    // Fit score enrichment (never fail apply)
    let fitScore: FitScoreResult | null = null;
    if (!isTalentNetwork && job && lead?.id) {
      try {
        fitScore = scoreCandidateJobFit(
          {
            skills: finalSkills,
            title: professionalTitle || lead.title || "",
            summary: finalSummary || message || "",
            experience: finalExperience as any,
            location: finalLocation,
          },
          {
            title: job.title,
            description: job.description || "",
            location: (job as any).location || "",
            salaryRange: (job as any).salaryRange || "",
          }
        );

        try {
          await addNoteToCandidate(
            lead.id,
            formatFitSummary(fitScore),
            source,
            {
              noteType: "Fit score",
              stage: "applied",
              jobId,
              jobTitle: job.title,
              fitScore: fitScore.score,
              fitGrade: fitScore.grade,
            }
          );
        } catch (fitNoteErr) {
          console.warn("[careers/apply] fit note warning:", fitNoteErr);
        }

        // Best-effort: stamp fit fields on job.candidates[] link
        try {
          const fresh = await getItem<{ candidates?: any[] }>(jobsTable, {
            tenant_id: tenantId,
            id: jobId,
          });
          const existing = Array.isArray(fresh?.candidates)
            ? fresh!.candidates!
            : [];
          const idx = existing.findIndex(
            (c: any) => c.candidateId === lead.id
          );
          if (idx >= 0) {
            const next = existing.map((c: any, i: number) =>
              i === idx
                ? {
                    ...c,
                    fitScore: fitScore!.score,
                    fitGrade: fitScore!.grade,
                    fitReasons: fitScore!.reasons.slice(0, 6),
                    fitScoredAt: new Date().toISOString(),
                  }
                : c
            );
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
          }
        } catch (fitLinkErr) {
          console.warn("[careers/apply] fit link stamp warning:", fitLinkErr);
        }
      } catch (fitErr) {
        console.warn("[careers/apply] fit score warning:", fitErr);
        fitScore = null;
      }
    }

    return jsonWithCors(request, {
      success: true,
      message: isTalentNetwork
        ? "Thanks for joining our talent network!"
        : "Application received. Thank you!",
      applicationId: lead.id,
      talentNetwork: isTalentNetwork,
      job: job ? { id: job.id, title: job.title } : null,
      resumeUploaded: !!resumeFileName,
      ...(screenResult
        ? {
            screenResult: {
              pass: screenResult.pass,
              score: screenResult.score,
              summary: screenResult.summary,
            },
          }
        : {}),
      ...(fitScore
        ? {
            fitScore: fitScore.score,
            fitGrade: fitScore.grade,
            fit: {
              score: fitScore.score,
              grade: fitScore.grade,
              reasons: fitScore.reasons,
              strengths: fitScore.strengths,
              gaps: fitScore.gaps,
              skillsMatched: fitScore.skillsMatched,
              skillsMissing: fitScore.skillsMissing,
            },
          }
        : {}),
    });
  } catch (err) {
    console.error("[public/careers/apply]", err);
    return jsonWithCors(
      request,
      { error: "Failed to submit application" },
      500
    );
  }
}
