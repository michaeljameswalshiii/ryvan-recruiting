/**
 * Public careers apply — creates candidate + links to open job.
 *
 * POST /api/public/careers/apply
 * Content-Type: multipart/form-data (preferred) or application/json
 *
 * Fields: jobId, name, email, phone?, message?, linkedinUrl?,
 *         resume (file PDF/DOCX)?, resumeUrl?, website? (honeypot)
 */

import { NextRequest } from "next/server";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  getJobById,
  linkCandidateToJob,
} from "@/lib/db/repositories/job-repository";
import { createLead } from "@/lib/db/repositories/lead-repository";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  assertCareersAccess,
  clientIp,
  getCareersTenantId,
  isJobListedOnWebsite,
  jsonWithCors,
  optionsCors,
} from "@/lib/careers/public";

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

    const jobId = String(fields.jobId || fields.job_id || "").trim();
    const name = String(fields.name || "").trim();
    const email = String(fields.email || "").trim();
    const phone = String(fields.phone || "").trim();
    const message = String(
      fields.message || fields.coverLetter || ""
    ).trim();
    const linkedinUrl = normalizeLinkedIn(
      String(fields.linkedinUrl || fields.linkedin_url || fields.linkedin || "")
    );
    const resumeUrlField = String(
      fields.resumeUrl || fields.resume_url || ""
    ).trim();
    const tenantParam = fields.tenant ? String(fields.tenant) : null;

    if (!jobId || !name || !email) {
      return jsonWithCors(
        request,
        { error: "jobId, name, and email are required" },
        400
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonWithCors(request, { error: "Invalid email address" }, 400);
    }

    if (name.length > 100 || email.length > 200 || message.length > 2000) {
      return jsonWithCors(request, { error: "Input too long" }, 400);
    }

    if (
      linkedinUrl &&
      linkedinUrl.length > 300
    ) {
      return jsonWithCors(request, { error: "LinkedIn URL too long" }, 400);
    }

    if (
      linkedinUrl &&
      !/^https?:\/\/(www\.)?linkedin\.com\//i.test(linkedinUrl) &&
      !linkedinUrl.includes("linkedin.com")
    ) {
      // Allow non-linkedin only if it looks like a full URL; otherwise warn
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

    const tenantId = getCareersTenantId(tenantParam);
    if (!tenantId) {
      return jsonWithCors(
        request,
        { error: "Careers apply not configured (CAREERS_TENANT_ID)" },
        503
      );
    }

    const job = await getJobById(tenantId, jobId);
    if (!job || !isJobListedOnWebsite(job)) {
      return jsonWithCors(
        request,
        { error: "This job is not open for applications on the careers site" },
        404
      );
    }

    let resumeUrl = resumeUrlField;
    let resumeFileName = "";

    if (resumeFile) {
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
        const uploaded = await uploadResumeToS3(resumeFile, tenantId);
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
    }

    const notes = [
      `Applied via public careers page for: ${job.title}`,
      message ? `Message:\n${message}` : "",
      linkedinUrl ? `LinkedIn: ${linkedinUrl}` : "",
      resumeFileName
        ? `Resume file: ${resumeFileName}`
        : resumeUrl && resumeUrl.startsWith("http")
          ? `Resume: ${resumeUrl}`
          : resumeUrl
            ? `Resume stored: ${resumeUrl}`
            : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const lead = await createLead(tenantId, {
      name,
      email,
      phone,
      title: job.title || "",
      status: "identification",
      source: "website-careers",
      notes,
      resume_url: resumeUrl || "",
      linkedin_url: linkedinUrl || "",
      location: job.location || "",
    });

    try {
      await linkCandidateToJob(tenantId, jobId, {
        candidateId: lead.id!,
        candidateName: lead.name,
        candidateEmail: lead.email || email,
        stage: "sourced",
        notes: message ? message.slice(0, 500) : "Applied via careers site",
      });
    } catch (linkErr) {
      console.warn("[careers/apply] link warning:", linkErr);
    }

    return jsonWithCors(request, {
      success: true,
      message: "Application received. Thank you!",
      applicationId: lead.id,
      job: { id: job.id, title: job.title },
      resumeUploaded: !!resumeFileName,
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
