/**
 * DELETE /api/candidate/[id]/resume — clear resume so a new one can be uploaded
 * POST   /api/candidate/[id]/resume — replace resume (multipart file)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionTenantId, getSession } from "@/lib/server-auth";
import {
  getLeadById,
  updateLead,
} from "@/lib/db/repositories/lead-repository";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { addNoteToCandidate } from "@/lib/events/candidate-events";
import { parseResumeBuffer } from "@/lib/candidates/resume-extract-server";
import { mergeParsedIntoEmptyFields } from "@/lib/candidates/resume-text-parser";
import {
  getS3ObjectBuffer,
  isAllowedResumeS3Key,
} from "@/lib/aws/s3";
import {
  isSparseParsedResume,
  MAX_RESUME_BYTES,
  resumeFileTooLargeMessage,
  resumeNoExtractableTextMessage,
  resumeUnsupportedTypeMessage,
  isAllowedResumeFileName,
  isAllowedResumeMime,
} from "@/lib/candidates/resume-upload-limits";

function getS3Client() {
  const region =
    process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1";
  return new S3Client({
    region,
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });
}

function getBucket(): string {
  const bucket =
    process.env.AWS_S3_BUCKET_NAME || process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME;
  if (!bucket) throw new Error("AWS_S3_BUCKET_NAME not configured");
  return bucket;
}

function extractS3Key(resumeUrl?: string | null, resumeKey?: string | null): string | null {
  if (resumeKey && !resumeKey.startsWith("http")) return resumeKey;
  if (!resumeUrl) return null;
  if (!resumeUrl.startsWith("http")) return resumeUrl;
  try {
    const u = new URL(resumeUrl);
    // path like /bucket/key or /key
    const path = u.pathname.replace(/^\//, "");
    // strip bucket name if present
    const bucket = process.env.AWS_S3_BUCKET_NAME || "";
    if (bucket && path.startsWith(bucket + "/")) {
      return path.slice(bucket.length + 1);
    }
    return path || null;
  } catch {
    return null;
  }
}

async function clearResumeFields(tenantId: string, id: string) {
  // updateLead only knows resume_url; use passthrough fields via direct update
  await updateLead(tenantId, id, {
    resume_url: "",
  } as any);

  // Clear extra fields with raw Dynamo update
  try {
    const { DynamoDBClient, UpdateItemCommand } = await import(
      "@aws-sdk/client-dynamodb"
    );
    const region =
      process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1";
    const client = new DynamoDBClient({
      region,
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
    const table =
      process.env.DYNAMODB_LEADS_TABLE ||
      process.env.DYNAMODB_CANDIDATES_TABLE ||
      "turnkey-leads";
    await client.send(
      new UpdateItemCommand({
        TableName: table,
        Key: {
          tenant_id: { S: tenantId },
          id: { S: id },
        },
        UpdateExpression:
          "SET resume_url = :empty, resume_file_name = :empty, resume_key = :empty, resume_s3_key = :empty, modified_at = :m",
        ExpressionAttributeValues: {
          ":empty": { S: "" },
          ":m": { S: new Date().toISOString() },
        },
      })
    );
  } catch (e) {
    console.warn("[resume clear] extra fields:", e);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const candidate = await getLeadById(tenantId, id);
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const c = candidate as any;
    const s3Key = extractS3Key(
      c.resume_url,
      c.resume_key || c.resumeKey || c.resume_s3_key
    );

    // Best-effort S3 delete
    if (s3Key && process.env.AWS_S3_BUCKET_NAME) {
      try {
        await getS3Client().send(
          new DeleteObjectCommand({
            Bucket: getBucket(),
            Key: s3Key,
          })
        );
      } catch (e) {
        console.warn("[DELETE resume] S3 delete failed (continuing):", e);
      }
    }

    await clearResumeFields(tenantId, id);

    const session = await getSession();
    await addNoteToCandidate(
      id,
      "Resume removed",
      session?.email || "system",
      { noteType: "profile_updated" }
    ).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE resume]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove resume" },
      { status: 500 }
    );
  }
}

/**
 * POST resume replacement:
 * - Preferred JSON: { s3Key, fileName, contentType?, parse?, fill? } after client presigned upload
 * - Legacy multipart: file field "resume"
 *
 * By default re-parses and fills empty profile fields only
 * (pass parse=0/false to skip parse, or fill=overwrite to replace scalars).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const candidate = await getLeadById(tenantId, id);
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const contentTypeHeader = request.headers.get("content-type") || "";
    let buffer: Buffer;
    let fileName: string;
    let s3Key: string;
    let shouldParse = true;
    let fillMode = "empty";
    let contentType = "application/pdf";

    if (contentTypeHeader.includes("application/json")) {
      const body = await request.json();
      s3Key = String(body.s3Key || body.fileKey || "").trim();
      fileName = String(body.fileName || body.file_name || "resume.pdf").trim();
      contentType = String(body.contentType || contentType);
      const parseFlag = String(body.parse ?? "1").toLowerCase();
      shouldParse = parseFlag !== "0" && parseFlag !== "false" && body.parse !== false;
      fillMode = String(body.fill ?? "empty").toLowerCase();

      if (!s3Key) {
        return NextResponse.json(
          { error: "s3Key is required (upload via presign first)" },
          { status: 400 }
        );
      }
      if (!isAllowedResumeS3Key(s3Key, tenantId)) {
        return NextResponse.json(
          { error: "Invalid resume storage key" },
          { status: 403 }
        );
      }
      if (
        !isAllowedResumeFileName(fileName) &&
        !isAllowedResumeMime(contentType)
      ) {
        return NextResponse.json(
          { error: resumeUnsupportedTypeMessage() },
          { status: 400 }
        );
      }

      const obj = await getS3ObjectBuffer(s3Key);
      buffer = obj.buffer;
      if (obj.contentType) contentType = obj.contentType;
      if (buffer.length > MAX_RESUME_BYTES) {
        return NextResponse.json(
          { error: resumeFileTooLargeMessage(buffer.length), code: "TOO_LARGE" },
          { status: 400 }
        );
      }
    } else {
      const form = await request.formData();
      const file = form.get("resume") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      fileName = file.name;
      const lower = file.name.toLowerCase();
      const ok =
        isAllowedResumeFileName(file.name) ||
        isAllowedResumeMime(file.type) ||
        lower.endsWith(".doc");
      if (!ok) {
        return NextResponse.json(
          { error: resumeUnsupportedTypeMessage() },
          { status: 400 }
        );
      }
      if (file.size > MAX_RESUME_BYTES) {
        return NextResponse.json(
          { error: resumeFileTooLargeMessage(file.size), code: "TOO_LARGE" },
          { status: 400 }
        );
      }

      const parseFlag = String(form.get("parse") ?? "1").toLowerCase();
      shouldParse = parseFlag !== "0" && parseFlag !== "false";
      fillMode = String(form.get("fill") ?? "empty").toLowerCase();

      buffer = Buffer.from(await file.arrayBuffer());
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      s3Key = `candidates/${id}/${Date.now()}-${safeName}`;
      contentType =
        file.type ||
        (lower.endsWith(".pdf")
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

      await getS3Client().send(
        new PutObjectCommand({
          Bucket: getBucket(),
          Key: s3Key,
          Body: buffer,
          ContentType: contentType,
        })
      );
    }

    // Remove old S3 object if present (and different key)
    const c = candidate as any;
    const oldKey = extractS3Key(
      c.resume_url,
      c.resume_key || c.resumeKey || c.resume_s3_key
    );
    if (oldKey && oldKey !== s3Key) {
      try {
        await getS3Client().send(
          new DeleteObjectCommand({ Bucket: getBucket(), Key: oldKey })
        );
      } catch {
        /* ignore */
      }
    }

    const updatePayload: Record<string, unknown> = {
      resume_url: s3Key,
    };
    let filledKeys: string[] = [];
    let parsedSummary: Record<string, unknown> | null = null;
    let warning: string | undefined;

    if (shouldParse) {
      try {
        const { parsed, method, text } = await parseResumeBuffer(buffer, fileName);
        parsedSummary = {
          name: parsed.name,
          title: parsed.title,
          email: parsed.email,
          skills: parsed.skills?.length ?? 0,
          experience: parsed.experience?.length ?? 0,
          education: parsed.education?.length ?? 0,
          method,
        };

        if (
          isSparseParsedResume({
            rawText: text,
            name: parsed.name,
            email: parsed.email,
            phone: parsed.phone,
            title: parsed.title,
            skills: parsed.skills,
            experience: parsed.experience,
            education: parsed.education,
            fileName,
          })
        ) {
          warning = resumeNoExtractableTextMessage(fileName);
        } else if (fillMode === "overwrite") {
          if (parsed.name) updatePayload.name = parsed.name;
          if (parsed.email) updatePayload.email = parsed.email;
          if (parsed.phone) updatePayload.phone = parsed.phone;
          if (parsed.title) updatePayload.title = parsed.title;
          if (parsed.location) updatePayload.location = parsed.location;
          if (parsed.linkedin) updatePayload.linkedin_url = parsed.linkedin;
          if (parsed.summary) updatePayload.summary = parsed.summary;
          if (parsed.salaryRequirements) {
            updatePayload.salary_requirements = parsed.salaryRequirements;
          }
          if (parsed.skills?.length) updatePayload.skills = parsed.skills;
          if (parsed.experience?.length) updatePayload.experience = parsed.experience;
          if (parsed.education?.length) updatePayload.education = parsed.education;
          if (parsed.certifications?.length) {
            updatePayload.certifications = parsed.certifications;
          }
          filledKeys = Object.keys(updatePayload).filter((k) => k !== "resume_url");
        } else {
          const merged = mergeParsedIntoEmptyFields(c, parsed);
          Object.assign(updatePayload, merged);
          filledKeys = Object.keys(merged);
        }
      } catch (parseErr) {
        console.warn("[POST resume] parse failed (upload still saved):", parseErr);
        warning =
          "Resume was saved, but automatic field extraction failed. You can edit the profile manually.";
      }
    }

    await updateLead(tenantId, id, updatePayload as any);

    try {
      const { DynamoDBClient, UpdateItemCommand } = await import(
        "@aws-sdk/client-dynamodb"
      );
      const region =
        process.env.AWS_REGION ||
        process.env.NEXT_PUBLIC_AWS_REGION ||
        "us-east-1";
      const client = new DynamoDBClient({
        region,
        credentials:
          process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
            ? {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
              }
            : undefined,
      });
      const table =
        process.env.DYNAMODB_LEADS_TABLE ||
        process.env.DYNAMODB_CANDIDATES_TABLE ||
        "turnkey-leads";
      await client.send(
        new UpdateItemCommand({
          TableName: table,
          Key: {
            tenant_id: { S: tenantId },
            id: { S: id },
          },
          UpdateExpression:
            "SET resume_url = :k, resume_key = :k, resume_s3_key = :k, resume_file_name = :n, modified_at = :m",
          ExpressionAttributeValues: {
            ":k": { S: s3Key },
            ":n": { S: fileName },
            ":m": { S: new Date().toISOString() },
          },
        })
      );
    } catch (e) {
      console.warn("[POST resume] metadata fields:", e);
    }

    const session = await getSession();
    const filledNote =
      filledKeys.length > 0
        ? ` Filled empty fields: ${filledKeys.join(", ")}.`
        : shouldParse
          ? warning
            ? " Could not extract text for autofill."
            : " Profile fields already set; no empty fields filled."
          : "";
    await addNoteToCandidate(
      id,
      `Resume replaced: ${fileName}.${filledNote}`,
      session?.email || "system",
      { noteType: "profile_updated" }
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      resume_url: s3Key,
      resume_file_name: fileName,
      fileKey: s3Key,
      filledFields: filledKeys,
      parsed: parsedSummary,
      warning,
      code: warning ? "NO_EXTRACTABLE_TEXT" : undefined,
    });
  } catch (error) {
    console.error("[POST resume]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to upload resume",
      },
      { status: 500 }
    );
  }
}
