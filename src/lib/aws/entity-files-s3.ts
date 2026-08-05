/**
 * S3 helpers for entity file attachments (candidates, companies, contacts, jobs).
 *
 * @serverOnly
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import type { EntityFileType } from '@/lib/schemas/entity-file';

export const MAX_ENTITY_FILE_BYTES = 15 * 1024 * 1024; // 15MB
export const MAX_INLINE_FILE_BYTES = 350 * 1024; // data-URL fallback

const ALLOWED_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.pdf',
  '.txt',
  '.csv',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.zip',
  '.msg',
  '.eml',
  '.rtf',
];

function getS3Client(): S3Client {
  const region =
    process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1';
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

export function getEntityFilesBucket(): string | null {
  return (
    process.env.AWS_S3_BUCKET_NAME ||
    process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME ||
    null
  );
}

export function isAllowedEntityFile(
  fileName: string,
  contentType?: string
): boolean {
  const lower = fileName.toLowerCase();
  if (ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
  if (!contentType) return false;
  const t = contentType.toLowerCase();
  return (
    t.startsWith('image/') ||
    t === 'application/pdf' ||
    t.startsWith('text/') ||
    t.includes('word') ||
    t.includes('sheet') ||
    t.includes('excel') ||
    t.includes('powerpoint') ||
    t.includes('presentation') ||
    t === 'application/zip' ||
    t === 'application/x-zip-compressed' ||
    t === 'message/rfc822'
  );
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
}

export function buildEntityFileS3Key(opts: {
  tenantId: string;
  entityType: EntityFileType;
  entityId: string;
  fileName: string;
}): string {
  const safe = sanitizeFileName(opts.fileName);
  return `tenants/${opts.tenantId}/files/${opts.entityType}/${opts.entityId}/${randomUUID()}-${safe}`;
}

export async function storeEntityFileObject(params: {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  tenantId: string;
  entityType: EntityFileType;
  entityId: string;
}): Promise<
  | { storage: 's3'; s3Key: string; size: number; contentType: string }
  | { storage: 'inline'; dataUrl: string; size: number; contentType: string }
> {
  const { buffer, fileName, contentType, tenantId, entityType, entityId } =
    params;

  if (buffer.length > MAX_ENTITY_FILE_BYTES) {
    throw new Error(
      `File too large. Maximum size is ${Math.round(MAX_ENTITY_FILE_BYTES / (1024 * 1024))}MB.`
    );
  }
  if (!isAllowedEntityFile(fileName, contentType)) {
    throw new Error(
      'Unsupported file type. Use PDF, Office docs, images, text, CSV, or ZIP.'
    );
  }

  const type = contentType || 'application/octet-stream';
  const size = buffer.length;
  const bucket = getEntityFilesBucket();

  if (bucket) {
    try {
      const s3Key = buildEntityFileS3Key({
        tenantId,
        entityType,
        entityId,
        fileName,
      });
      const client = getS3Client();
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: buffer,
          ContentType: type,
        })
      );
      return { storage: 's3', s3Key, size, contentType: type };
    } catch (err) {
      console.error('[entity-files] S3 upload failed', err);
      // fall through to inline for small files
    }
  }

  if (size > MAX_INLINE_FILE_BYTES) {
    throw new Error(
      bucket
        ? 'File upload to storage failed. Try a smaller file or contact admin.'
        : 'File is too large without S3. Configure AWS_S3_BUCKET_NAME (or use files under ~350KB).'
    );
  }

  const base64 = buffer.toString('base64');
  return {
    storage: 'inline',
    dataUrl: `data:${type};base64,${base64}`,
    size,
    contentType: type,
  };
}

export async function getEntityFileDownloadUrl(
  s3Key: string,
  expiresInSeconds = 3600
): Promise<string> {
  const bucket = getEntityFilesBucket();
  if (!bucket) throw new Error('S3 bucket not configured');
  const client = getS3Client();
  const command = new GetObjectCommand({ Bucket: bucket, Key: s3Key });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export async function deleteEntityFileObject(s3Key: string): Promise<void> {
  const bucket = getEntityFilesBucket();
  if (!bucket) return;
  const client = getS3Client();
  try {
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: s3Key })
    );
  } catch (err) {
    console.warn('[entity-files] S3 delete failed', err);
  }
}
