/**
 * Issue attachment uploads (S3) with data-URL fallback for small files.
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB
const MAX_DATA_URL_BYTES = 350 * 1024; // keep DynamoDB items small if no S3

const ALLOWED_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.pdf',
  '.txt',
  '.doc',
  '.docx',
  '.csv',
  '.xlsx',
  '.xls',
  '.zip',
];

function getS3Client(): S3Client {
  const region = process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1';
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

function getBucketName(): string | null {
  return (
    process.env.AWS_S3_BUCKET_NAME ||
    process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME ||
    null
  );
}

export function isAllowedIssueFile(fileName: string, contentType?: string): boolean {
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
    t === 'application/zip' ||
    t === 'application/x-zip-compressed'
  );
}

export async function getIssueAttachmentUrl(s3Key: string): Promise<string> {
  const bucket = getBucketName();
  if (!bucket) throw new Error('S3 bucket not configured');
  const client = getS3Client();
  const command = new GetObjectCommand({ Bucket: bucket, Key: s3Key });
  return getSignedUrl(client, command, { expiresIn: 60 * 60 * 24 * 7 });
}

export async function storeIssueAttachment(params: {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  tenantId: string;
  issueId: string;
}): Promise<{ url: string; s3Key?: string; name: string; type: string; size: number }> {
  const { buffer, fileName, contentType, tenantId, issueId } = params;

  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error('File too large. Maximum size is 8MB.');
  }
  if (!isAllowedIssueFile(fileName, contentType)) {
    throw new Error(
      'Unsupported file type. Use images, PDF, Office docs, text, CSV, or ZIP.'
    );
  }

  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const size = buffer.length;
  const type = contentType || 'application/octet-stream';
  const bucket = getBucketName();

  if (bucket) {
    try {
      const s3Key = `tenants/${tenantId}/issues/${issueId}/${uuidv4()}-${sanitized}`;
      const client = getS3Client();
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: buffer,
          ContentType: type,
        })
      );
      const url = await getIssueAttachmentUrl(s3Key);
      return { url, s3Key, name: fileName, type, size };
    } catch (err) {
      console.error('[storeIssueAttachment] S3 upload failed, trying data URL', err);
      // fall through to data URL for small files
    }
  }

  if (size > MAX_DATA_URL_BYTES) {
    throw new Error(
      bucket
        ? 'File upload to storage failed. Try a smaller file or contact admin.'
        : 'File is too large to store without S3. Max ~350KB without bucket config.'
    );
  }

  const base64 = buffer.toString('base64');
  const url = `data:${type};base64,${base64}`;
  return { url, name: fileName, type, size };
}
