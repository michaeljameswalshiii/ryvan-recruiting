/**
 * OCR fallback for scanned / image-based resumes (LinkedIn profile PDFs, etc.).
 * Uses Amazon Textract, then the same parseResumeText path as digital PDFs.
 *
 * @serverOnly
 */

import {
  DetectDocumentTextCommand,
  GetDocumentTextDetectionCommand,
  StartDocumentTextDetectionCommand,
  TextractClient,
  type Block,
} from "@aws-sdk/client-textract";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const MAX_SYNC_BYTES = 5 * 1024 * 1024;
const POLL_MS = 700;
const POLL_DEADLINE_MS = 45_000;

function awsRegion() {
  return process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1";
}

function textractClient() {
  const region = awsRegion();
  const accessKeyId =
    process.env.AWS_ACCESS_KEY_ID || process.env.MY_AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.AWS_SECRET_ACCESS_KEY || process.env.MY_AWS_SECRET_ACCESS_KEY;
  return new TextractClient({
    region,
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });
}

function s3Client() {
  const region = awsRegion();
  const accessKeyId =
    process.env.AWS_ACCESS_KEY_ID || process.env.MY_AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.AWS_SECRET_ACCESS_KEY || process.env.MY_AWS_SECRET_ACCESS_KEY;
  return new S3Client({
    region,
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });
}

function bucketName(): string | null {
  return (
    process.env.AWS_S3_BUCKET_NAME ||
    process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME ||
    null
  );
}

function linesFromBlocks(blocks?: Block[]): string {
  return (blocks || [])
    .filter((block) => block.BlockType === "LINE" && block.Text)
    .map((block) => String(block.Text).trim())
    .filter(Boolean)
    .join("\n");
}

function isMultipageOrTooLargeError(error: unknown): boolean {
  const name = error && typeof error === "object" && "name" in error
    ? String((error as { name?: string }).name)
    : "";
  const message = error instanceof Error ? error.message : String(error || "");
  return (
    name === "UnsupportedDocumentException" ||
    name === "InvalidParameterException" ||
    /pages|page limit|multipage|more than 1 page|document is too large/i.test(
      message
    )
  );
}

async function detectDocumentTextSync(buffer: Buffer): Promise<string> {
  const res = await textractClient().send(
    new DetectDocumentTextCommand({
      Document: { Bytes: buffer },
    })
  );
  return linesFromBlocks(res.Blocks);
}

async function ensureOcrObject(opts: {
  buffer: Buffer;
  fileName: string;
  s3Key?: string;
}): Promise<{ bucket: string; key: string }> {
  const bucket = bucketName();
  if (!bucket) throw new Error("AWS_S3_BUCKET_NAME is not set");
  if (opts.s3Key) return { bucket, key: opts.s3Key };

  const safe = opts.fileName.replace(/[^a-zA-Z0-9.-]/g, "_") || "resume.pdf";
  const key = `resumes/ocr-tmp/${Date.now()}-${safe}`;
  await s3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: opts.buffer,
      ContentType: "application/pdf",
    })
  );
  return { bucket, key };
}

async function detectDocumentTextAsync(opts: {
  bucket: string;
  key: string;
}): Promise<string> {
  const client = textractClient();
  const started = await client.send(
    new StartDocumentTextDetectionCommand({
      DocumentLocation: {
        S3Object: { Bucket: opts.bucket, Name: opts.key },
      },
    })
  );
  const jobId = started.JobId;
  if (!jobId) throw new Error("Textract did not return a job id");

  const deadline = Date.now() + POLL_DEADLINE_MS;
  const pages: string[] = [];
  let nextToken: string | undefined;

  while (Date.now() < deadline) {
    const status = await client.send(
      new GetDocumentTextDetectionCommand({
        JobId: jobId,
        NextToken: nextToken,
        MaxResults: 1000,
      })
    );

    if (status.JobStatus === "FAILED") {
      throw new Error(status.StatusMessage || "Textract job failed");
    }

    if (status.JobStatus === "SUCCEEDED") {
      pages.push(linesFromBlocks(status.Blocks));
      nextToken = status.NextToken;
      while (nextToken) {
        const more = await client.send(
          new GetDocumentTextDetectionCommand({
            JobId: jobId,
            NextToken: nextToken,
            MaxResults: 1000,
          })
        );
        pages.push(linesFromBlocks(more.Blocks));
        nextToken = more.NextToken;
      }
      return pages.filter(Boolean).join("\n");
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  throw new Error("Textract OCR timed out");
}

export async function extractResumeTextWithOcr(
  buffer: Buffer,
  opts?: { fileName?: string; s3Key?: string }
): Promise<{ text: string; method: string } | null> {
  if (!buffer?.length) return null;

  try {
    if (buffer.length <= MAX_SYNC_BYTES) {
      try {
        const text = await detectDocumentTextSync(buffer);
        if (text.trim().length > 20) {
          return { text, method: "textract-sync" };
        }
      } catch (error) {
        if (!isMultipageOrTooLargeError(error)) {
          console.warn("[resume-ocr] Textract sync failed:", error);
        }
      }
    }

    const loc = await ensureOcrObject({
      buffer,
      fileName: opts?.fileName || "resume.pdf",
      s3Key: opts?.s3Key,
    });
    const text = await detectDocumentTextAsync(loc);
    if (text.trim().length > 20) {
      return { text, method: "textract-async" };
    }
  } catch (error) {
    console.warn("[resume-ocr] OCR unavailable:", error);
  }

  return null;
}
