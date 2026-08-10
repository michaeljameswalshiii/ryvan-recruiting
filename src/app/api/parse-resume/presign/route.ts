/**
 * POST /api/parse-resume/presign
 * Auth required. Returns a short-lived S3 PUT URL so the client can upload
 * the resume directly (bypasses serverless body size limits).
 *
 * Body: { fileName, contentType?, sizeBytes, candidateId? }
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSessionTenantId } from "@/lib/server-auth";
import { getPresignedPutUrl, getS3BucketName } from "@/lib/aws/s3";
import {
  isAllowedResumeFileName,
  isAllowedResumeMime,
  MAX_RESUME_BYTES,
  maxResumeMbLabel,
  resumeFileTooLargeMessage,
  resumeUnsupportedTypeMessage,
} from "@/lib/candidates/resume-upload-limits";

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
}

function guessContentType(fileName: string, contentType?: string): string {
  if (contentType && isAllowedResumeMime(contentType)) return contentType;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".doc")) return "application/msword";
  return contentType || "application/octet-stream";
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ensure bucket is configured before minting a URL
    try {
      getS3BucketName();
    } catch {
      return NextResponse.json(
        {
          error:
            "Resume storage is not configured (AWS_S3_BUCKET_NAME). Contact your admin.",
          code: "S3_NOT_CONFIGURED",
        },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const fileName = String(body.fileName || body.file_name || "").trim();
    const sizeBytes = Number(body.sizeBytes ?? body.size ?? 0);
    const candidateId = body.candidateId
      ? String(body.candidateId).trim()
      : "";
    const contentType = guessContentType(
      fileName,
      body.contentType ? String(body.contentType) : undefined,
    );

    if (!fileName) {
      return NextResponse.json(
        { error: "fileName is required", code: "INVALID" },
        { status: 400 },
      );
    }

    if (
      !isAllowedResumeFileName(fileName) &&
      !isAllowedResumeMime(contentType)
    ) {
      return NextResponse.json(
        { error: resumeUnsupportedTypeMessage(), code: "UNSUPPORTED_TYPE" },
        { status: 400 },
      );
    }

    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return NextResponse.json(
        { error: "sizeBytes is required", code: "INVALID" },
        { status: 400 },
      );
    }

    if (sizeBytes > MAX_RESUME_BYTES) {
      return NextResponse.json(
        {
          error: resumeFileTooLargeMessage(sizeBytes),
          code: "TOO_LARGE",
          maxBytes: MAX_RESUME_BYTES,
          maxMb: maxResumeMbLabel(),
        },
        { status: 400 },
      );
    }

    const safe = sanitizeFileName(fileName);
    const s3Key = candidateId
      ? `candidates/${candidateId}/${Date.now()}-${safe}`
      : `tenants/${tenantId}/resumes/pending/${randomUUID()}-${safe}`;

    const uploadUrl = await getPresignedPutUrl(s3Key, contentType, 900);

    return NextResponse.json({
      success: true,
      uploadUrl,
      s3Key,
      contentType,
      maxBytes: MAX_RESUME_BYTES,
      expiresInSeconds: 900,
      /** Client must send this Content-Type on the PUT (must match signature). */
      headers: {
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    console.error("[POST /api/parse-resume/presign]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to prepare resume upload",
        code: "PRESIGN_FAILED",
      },
      { status: 500 },
    );
  }
}
