/**
 * Store / load custom invoice templates (Word, PDF) in S3.
 * @serverOnly
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

const MAX_BYTES = 8 * 1024 * 1024;

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function getS3Client(): S3Client {
  const region =
    process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1";
  const accessKeyId =
    process.env.AWS_ACCESS_KEY_ID || process.env.MY_AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.AWS_SECRET_ACCESS_KEY || process.env.MY_AWS_SECRET_ACCESS_KEY;
  if (accessKeyId && secretAccessKey) {
    return new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return new S3Client({ region });
}

function getBucket(): string {
  const bucket =
    process.env.AWS_S3_BUCKET_NAME || process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME;
  if (!bucket) throw new Error("AWS_S3_BUCKET_NAME is not set");
  return bucket;
}

export function detectInvoiceSourceKind(
  fileName: string,
  contentType?: string
): "docx" | "pdf" | null {
  const name = (fileName || "").toLowerCase();
  const type = (contentType || "").toLowerCase();
  if (name.endsWith(".pdf") || type === "application/pdf") return "pdf";
  if (
    name.endsWith(".docx") ||
    type.includes("wordprocessingml") ||
    type.includes("officedocument.word")
  ) {
    return "docx";
  }
  return null;
}

export function isInvoiceTemplateFileKey(
  key: string,
  tenantId: string
): boolean {
  const clean = String(key || "").replace(/^\/+/, "");
  if (!clean || clean.includes("..")) return false;
  return clean.startsWith(`tenants/${tenantId}/invoice-templates/`);
}

export async function uploadInvoiceTemplateFile(opts: {
  tenantId: string;
  buffer: Buffer;
  fileName: string;
  contentType: string;
}): Promise<{
  key: string;
  name: string;
  type: string;
  kind: "docx" | "pdf";
  size: number;
}> {
  const kind = detectInvoiceSourceKind(opts.fileName, opts.contentType);
  if (!kind) {
    throw new Error("Upload a Word (.docx) or PDF file.");
  }
  if (opts.buffer.length > MAX_BYTES) {
    throw new Error("File too large. Maximum size is 8MB.");
  }

  const sanitized = (opts.fileName || "template").replace(
    /[^a-zA-Z0-9._-]/g,
    "_"
  );
  const key = `tenants/${opts.tenantId}/invoice-templates/${uuidv4()}-${sanitized}`;
  const type = kind === "pdf" ? "application/pdf" : DOCX_MIME;

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: opts.buffer,
      ContentType: type,
    })
  );

  return {
    key,
    name: opts.fileName,
    type,
    kind,
    size: opts.buffer.length,
  };
}

export async function getInvoiceTemplateFile(
  key: string,
  tenantId: string
): Promise<Buffer> {
  if (!isInvoiceTemplateFileKey(key, tenantId)) {
    throw new Error("Invalid invoice template file");
  }
  const res = await getS3Client().send(
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: key,
    })
  );
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error("Invoice template file is empty");
  return Buffer.from(bytes);
}
