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
 * POST multipart: file field "resume" — upload replacement.
 * By default re-parses the file and fills empty profile fields only
 * (pass parse=0 to skip parse, or fill=overwrite to replace scalars when present).
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

    const form = await request.formData();
    const file = form.get("resume") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const lower = file.name.toLowerCase();
    const ok =
      lower.endsWith(".pdf") ||
      lower.endsWith(".doc") ||
      lower.endsWith(".docx") ||
      file.type.includes("pdf") ||
      file.type.includes("word");
    if (!ok) {
      return NextResponse.json(
        { error: "Upload PDF or Word (.pdf, .doc, .docx)" },
        { status: 400 }
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    const parseFlag = String(form.get("parse") ?? "1").toLowerCase();
    const shouldParse = parseFlag !== "0" && parseFlag !== "false";
    const fillMode = String(form.get("fill") ?? "empty").toLowerCase(); // empty | overwrite

    // Remove old S3 object if present
    const c = candidate as any;
    const oldKey = extractS3Key(
      c.resume_url,
      c.resume_key || c.resumeKey || c.resume_s3_key
    );
    if (oldKey) {
      try {
        await getS3Client().send(
          new DeleteObjectCommand({ Bucket: getBucket(), Key: oldKey })
        );
      } catch {
        /* ignore */
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const s3Key = `candidates/${id}/${Date.now()}-${safeName}`;
    const contentType =
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

    const updatePayload: Record<string, unknown> = {
      resume_url: s3Key,
    };
    let filledKeys: string[] = [];
    let parsedSummary: Record<string, unknown> | null = null;

    if (shouldParse) {
      try {
        const { parsed, method } = await parseResumeBuffer(buffer, file.name);
        parsedSummary = {
          name: parsed.name,
          title: parsed.title,
          email: parsed.email,
          skills: parsed.skills?.length ?? 0,
          experience: parsed.experience?.length ?? 0,
          education: parsed.education?.length ?? 0,
          method,
        };

        if (fillMode === "overwrite") {
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
            ":n": { S: file.name },
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
          ? " Profile fields already set; no empty fields filled."
          : "";
    await addNoteToCandidate(
      id,
      `Resume replaced: ${file.name}.${filledNote}`,
      session?.email || "system",
      { noteType: "profile_updated" }
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      resume_url: s3Key,
      resume_file_name: file.name,
      fileKey: s3Key,
      filledFields: filledKeys,
      parsed: parsedSummary,
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
