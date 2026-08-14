/**
 * POST /api/parse-resume
 *
 * Preferred: JSON after direct S3 upload
 *   { s3Key, fileName, candidateId?, contentType? }
 *
 * Legacy: multipart FormData
 *   resume file | googleDocUrl | (+ optional candidateId)
 *
 * Direct S3 avoids Vercel ~4.5MB body limits for large resumes.
 */

import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { parseResumeBuffer } from "@/lib/candidates/resume-extract-server";
import {
  extractNameFromFilename,
  parseResumeText,
  type StructuredParsedResume,
} from "@/lib/candidates/resume-text-parser";
import { getSessionTenantId } from "@/lib/server-auth";
import {
  getPresignedGetUrl,
  getS3ObjectBuffer,
  isAllowedResumeS3Key,
} from "@/lib/aws/s3";
import {
  isAllowedResumeFileName,
  isAllowedResumeMime,
  isSparseParsedResume,
  MAX_RESUME_BYTES,
  resumeFileTooLargeMessage,
  resumeNoExtractableTextMessage,
  resumeUnsupportedTypeMessage,
} from "@/lib/candidates/resume-upload-limits";

export const maxDuration = 60;

const SEVEN_DAYS_SECONDS = 604800;

function getS3Client(): S3Client {
  const region =
    process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1";
  return new S3Client({ region });
}

function getBucketName(): string {
  const bucketName =
    process.env.AWS_S3_BUCKET_NAME || process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("AWS_S3_BUCKET_NAME environment variable not configured");
  }
  return bucketName;
}

async function uploadToS3Permanent(
  buffer: Buffer,
  fileName: string,
  contentType: string,
  candidateId: string,
): Promise<{ s3Key: string; presignedUrl: string }> {
  const s3Client = getS3Client();
  const bucketName = getBucketName();

  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
  const s3Key = `resumes/${candidateId}/${timestamp}-${sanitizedFileName}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  const getCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
  });

  const presignedUrl = await getSignedUrl(s3Client, getCommand, {
    expiresIn: SEVEN_DAYS_SECONDS,
  });

  return { s3Key, presignedUrl };
}

async function fetchGoogleDocAsText(
  docId: string,
): Promise<{ text: string; error?: string }> {
  try {
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
    const response = await fetch(exportUrl, {
      method: "GET",
      headers: { Accept: "text/plain" },
    });

    if (!response.ok) {
      const htmlUrl = `https://docs.google.com/document/d/${docId}/export?format=html`;
      const htmlResponse = await fetch(htmlUrl);
      if (!htmlResponse.ok) {
        return { text: "", error: "Failed to fetch Google Doc" };
      }
      const htmlText = await htmlResponse.text();
      const text = htmlText
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { text };
    }

    const text = await response.text();
    return { text };
  } catch (err) {
    console.error("fetchGoogleDocAsText error:", err);
    return { text: "", error: "Failed to fetch Google Doc" };
  }
}

function extractGoogleDocId(url: string): string | null {
  const match = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

function toApiResume(parsed: StructuredParsedResume) {
  return {
    name: parsed.name || "",
    title: parsed.title || "",
    email: parsed.email || "",
    phone: parsed.phone || "",
    location: parsed.location || "",
    fullAddress: parsed.fullAddress || parsed.location || "",
    linkedin: parsed.linkedin || "",
    summary: parsed.summary || "",
    salaryRequirements: parsed.salaryRequirements || "",
    skills: parsed.skills || [],
    tags: parsed.tags || [],
    experience: (parsed.experience || []).map((e) => ({
      company: e.company || "",
      title: e.title || "",
      dates: e.dates || "",
      description: e.description || "",
      location: e.location || "",
    })),
    education: (parsed.education || []).map((e) => ({
      school: e.school || "",
      degree: e.degree || "",
      dates: e.dates || "",
      field: e.field || "",
    })),
    certifications: parsed.certifications || [],
  };
}

async function finishParse(opts: {
  buffer: Buffer;
  fileName: string;
  candidateId?: string;
  /** When already uploaded (presign path), reuse this key */
  existingS3Key?: string;
  contentType?: string;
}) {
  const { buffer, fileName, candidateId, existingS3Key, contentType } = opts;

  if (buffer.length > MAX_RESUME_BYTES) {
    return NextResponse.json(
      {
        success: false,
        error: resumeFileTooLargeMessage(buffer.length),
        code: "TOO_LARGE",
      },
      { status: 400 },
    );
  }

  console.log(
    "parse-resume: file size =",
    buffer.length,
    "name =",
    fileName,
    "s3Key =",
    existingS3Key || "(multipart)",
  );

  const {
    parsed,
    text: rawText,
    method: extractionMethod,
  } = await parseResumeBuffer(buffer, fileName, {
    s3Key: existingS3Key,
  });

  console.log(
    "parse-resume: extraction method =",
    extractionMethod,
    "chars =",
    rawText.length,
  );

  const finalResume = toApiResume(parsed);

  console.log(
    "parse-resume: final name =",
    finalResume.name,
    "email =",
    finalResume.email ? "yes" : "no",
    "phone =",
    finalResume.phone ? "yes" : "no",
    "title =",
    finalResume.title,
    "skills =",
    finalResume.skills.length,
    "experience =",
    finalResume.experience.length,
    "education =",
    finalResume.education.length,
  );

  let resumeUrl = "";
  let fileKey = existingS3Key || "";

  if (existingS3Key) {
    try {
      resumeUrl = await getPresignedGetUrl(existingS3Key, SEVEN_DAYS_SECONDS);
    } catch (e) {
      console.warn("parse-resume: presigned get failed", e);
    }
  } else if (candidateId && buffer.length > 0) {
    try {
      const s3Result = await uploadToS3Permanent(
        buffer,
        fileName,
        contentType || "application/pdf",
        candidateId,
      );
      resumeUrl = s3Result.presignedUrl;
      fileKey = s3Result.s3Key;
    } catch (s3Err) {
      console.error("parse-resume: S3 upload failed:", s3Err);
    }
  }

  if (
    isSparseParsedResume({
      rawText,
      name: finalResume.name,
      email: finalResume.email,
      phone: finalResume.phone,
      title: finalResume.title,
      skills: finalResume.skills,
      experience: finalResume.experience,
      education: finalResume.education,
      fileName,
    })
  ) {
    return NextResponse.json(
      {
        success: false,
        error: resumeNoExtractableTextMessage(fileName),
        code: "NO_EXTRACTABLE_TEXT",
        /** File may already be on S3 — caller can still attach it manually */
        resume: finalResume,
        extractionMethod: extractionMethod || "none",
        rawText: rawText.substring(0, 400),
        resumeUrl: resumeUrl || null,
        fileKey: fileKey || null,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    success: true,
    resume: finalResume,
    extractionMethod: extractionMethod || "structured",
    rawText: rawText.substring(0, 800),
    resumeUrl: resumeUrl || null,
    fileKey: fileKey || null,
  });
}

export async function POST(req: NextRequest) {
  console.log("parse-resume: starting");
  let fileName = "resume.pdf";

  try {
    const contentTypeHeader = req.headers.get("content-type") || "";

    // --- JSON path: parse from S3 key after direct upload ---
    if (contentTypeHeader.includes("application/json")) {
      const tenantId = await getSessionTenantId();
      if (!tenantId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const body = await req.json();
      const s3Key = String(body.s3Key || body.fileKey || "").trim();
      fileName = String(body.fileName || body.file_name || "resume.pdf").trim();
      const candidateId = body.candidateId
        ? String(body.candidateId).trim()
        : "";

      if (!s3Key) {
        return NextResponse.json(
          { error: "s3Key is required", code: "INVALID" },
          { status: 400 },
        );
      }

      if (!isAllowedResumeS3Key(s3Key, tenantId)) {
        return NextResponse.json(
          { error: "Invalid resume storage key", code: "INVALID_KEY" },
          { status: 403 },
        );
      }

      if (
        !isAllowedResumeFileName(fileName) &&
        !isAllowedResumeMime(body.contentType)
      ) {
        return NextResponse.json(
          { error: resumeUnsupportedTypeMessage(), code: "UNSUPPORTED_TYPE" },
          { status: 400 },
        );
      }

      const { buffer, contentType } = await getS3ObjectBuffer(s3Key);
      return finishParse({
        buffer,
        fileName,
        candidateId: candidateId || undefined,
        existingS3Key: s3Key,
        contentType: contentType || body.contentType,
      });
    }

    // --- multipart / form path ---
    const formData = await req.formData();
    const googleDocUrl = formData.get("googleDocUrl") as string;

    if (googleDocUrl) {
      console.log("parse-resume: processing Google Doc URL");
      const docId = extractGoogleDocId(googleDocUrl);
      if (!docId) {
        return NextResponse.json(
          { error: "Invalid Google Docs URL" },
          { status: 400 },
        );
      }

      const { text: rawText, error } = await fetchGoogleDocAsText(docId);
      if (error || !rawText) {
        return NextResponse.json(
          { error: error || "Failed to fetch Google Doc content" },
          { status: 400 },
        );
      }

      console.log("parse-resume: Google Doc fetched, chars =", rawText.length);
      const parsed = parseResumeText(rawText);
      const finalResume = toApiResume(parsed);

      if (
        isSparseParsedResume({
          rawText,
          name: finalResume.name,
          email: finalResume.email,
          phone: finalResume.phone,
          title: finalResume.title,
          skills: finalResume.skills,
          experience: finalResume.experience,
          education: finalResume.education,
        })
      ) {
        return NextResponse.json(
          {
            success: false,
            error: resumeNoExtractableTextMessage("Google Doc"),
            code: "NO_EXTRACTABLE_TEXT",
            resume: finalResume,
          },
          { status: 422 },
        );
      }

      return NextResponse.json({
        success: true,
        resume: finalResume,
        extractionMethod: "google-doc",
        resumeUrl: googleDocUrl,
        fileKey: null,
      });
    }

    // Form field s3Key (after client PUT)
    const formS3Key = String(formData.get("s3Key") || formData.get("fileKey") || "").trim();
    if (formS3Key) {
      const tenantId = await getSessionTenantId();
      if (!tenantId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (!isAllowedResumeS3Key(formS3Key, tenantId)) {
        return NextResponse.json(
          { error: "Invalid resume storage key", code: "INVALID_KEY" },
          { status: 403 },
        );
      }
      fileName = String(formData.get("fileName") || "resume.pdf").trim();
      const candidateId = formData.get("candidateId")
        ? String(formData.get("candidateId")).trim()
        : "";
      const { buffer, contentType } = await getS3ObjectBuffer(formS3Key);
      return finishParse({
        buffer,
        fileName,
        candidateId: candidateId || undefined,
        existingS3Key: formS3Key,
        contentType,
      });
    }

    const file = formData.get("resume") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "No file provided. Upload via S3 presign or attach a resume file.", code: "NO_FILE" },
        { status: 400 },
      );
    }

    fileName = file.name || "resume.pdf";
    const fileType = file.type?.toLowerCase() || "";
    const fileNameLower = fileName.toLowerCase();
    const hasValidExtension =
      isAllowedResumeFileName(fileName) ||
      fileNameLower.endsWith(".doc");
    const hasValidType = isAllowedResumeMime(fileType);

    if (!hasValidExtension && !hasValidType) {
      console.log("parse-resume: unsupported file type", file.type, fileName);
      return NextResponse.json(
        { error: resumeUnsupportedTypeMessage(), code: "UNSUPPORTED_TYPE" },
        { status: 400 },
      );
    }

    if (file.size > MAX_RESUME_BYTES) {
      return NextResponse.json(
        {
          error: resumeFileTooLargeMessage(file.size),
          code: "TOO_LARGE",
        },
        { status: 400 },
      );
    }

    // Warn path: large multipart bodies often fail on Vercel before this runs
    if (file.size > 4 * 1024 * 1024) {
      console.warn(
        "parse-resume: large multipart body",
        file.size,
        "— prefer presigned S3 upload",
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const candidateId = formData.get("candidateId")
      ? String(formData.get("candidateId")).trim()
      : "";

    return finishParse({
      buffer,
      fileName,
      candidateId: candidateId || undefined,
      contentType: file.type,
    });
  } catch (error: any) {
    console.error("parse-resume error:", error);
    const msg = error?.message || "Failed to parse resume";
    // Common when client hit body size limit → empty/truncated payload
    const looksLikeSize =
      /body|payload|entity too large|413|buffer/i.test(msg) ||
      /Unexpected end/i.test(msg);

    return NextResponse.json(
      {
        success: false,
        error: looksLikeSize
          ? resumeFileTooLargeMessage()
          : msg,
        code: looksLikeSize ? "TOO_LARGE" : "PARSE_FAILED",
        resume: {
          name: extractNameFromFilename(fileName),
          email: "",
          phone: "",
          location: "",
          linkedin: "",
          title: "",
          summary: "",
          skills: [],
          tags: [],
          experience: [],
          education: [],
          certifications: [],
        },
      },
      { status: looksLikeSize ? 413 : 500 },
    );
  }
}
