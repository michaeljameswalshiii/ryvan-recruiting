/**
 * AWS S3 Utility
 * Server-side S3 operations for file uploads
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

// S3 client configuration
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

// Get S3 bucket name from environment
export function getS3BucketName(): string {
  const bucketName =
    process.env.AWS_S3_BUCKET_NAME || process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('AWS_S3_BUCKET_NAME environment variable is not set');
  }
  return bucketName;
}

/**
 * Whether an S3 key was issued for this tenant's resume flow
 * (or is under a candidate path). Prevents arbitrary S3 reads.
 */
export function isAllowedResumeS3Key(s3Key: string, tenantId: string): boolean {
  const key = String(s3Key || '').replace(/^\/+/, '');
  if (!key || key.includes('..')) return false;
  if (key.startsWith(`tenants/${tenantId}/resumes/`)) return true;
  // Existing resume layout used across the app
  if (key.startsWith('candidates/') || key.startsWith('resumes/')) return true;
  return false;
}

// Supported file types
const SUPPORTED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const SUPPORTED_EXTENSIONS = ['.pdf', '.docx'];

/**
 * Upload a file buffer to S3
 * @param buffer - File buffer
 * @param fileName - Original file name
 * @param contentType - MIME type
 * @param tenantId - Optional tenant ID for folder organization
 * @returns S3 URL of uploaded file
 */
export async function uploadToS3(
  buffer: Buffer,
  fileName: string,
  contentType: string,
  tenantId?: string
): Promise<string> {
  // Validate file type
  const fileNameLower = fileName.toLowerCase();
  const hasValidExtension = SUPPORTED_EXTENSIONS.some(ext => fileNameLower.endsWith(ext));
  const hasValidType = SUPPORTED_TYPES.includes(contentType.toLowerCase());

  if (!hasValidExtension && !hasValidType) {
    throw new Error('Unsupported file type. Please upload PDF or Word (.docx) files.');
  }

  // Generate unique file key
  const uuid = uuidv4();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const uniqueFileName = `${uuid}_${sanitizedFileName}`;
  
  // Build S3 key (path in bucket)
  const folder = tenantId ? `tenants/${tenantId}` : 'candidates';
  const s3Key = `${folder}/resumes/${uniqueFileName}`;

  // Get S3 client and bucket
  const s3Client = getS3Client();
  const bucketName = getS3BucketName();

  // Create put object command
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
    Body: buffer,
    ContentType: contentType,
  });

  // Upload to S3
  await s3Client.send(command);

  // Build and return public URL
  // Use cloudfront URL if configured, otherwise S3 URL
  const cloudfrontUrl = process.env.CLOUDFRONT_URL;
  if (cloudfrontUrl) {
    return `${cloudfrontUrl}/${s3Key}`;
  }
  
// Instead of direct S3 URL, use presigned URL for secure access
  return await getPresignedGetUrl(s3Key);
}

/**
 * Generate a presigned URL for downloading a file from S3
 * @param s3Key - The S3 key (path) of the file
 * @param expiresInSeconds - URL expiration time (default 3600 = 1 hour)
 * @returns Presigned URL for download
 */
export async function getPresignedGetUrl(
  s3Key: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const s3Client = getS3Client();
  const bucketName = getS3BucketName();

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
  });

  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Presigned PUT so the browser can upload large resumes directly to S3
 * (avoids Vercel ~4.5MB request body limits).
 * Bucket CORS must allow PUT from the app origin.
 */
export async function getPresignedPutUrl(
  s3Key: string,
  contentType: string,
  expiresInSeconds: number = 900
): Promise<string> {
  const s3Client = getS3Client();
  const bucketName = getS3BucketName();

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
    ContentType: contentType || "application/octet-stream",
  });

  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

/** Download an object as a Buffer (server-side parse after direct upload). */
export async function getS3ObjectBuffer(s3Key: string): Promise<{
  buffer: Buffer;
  contentType?: string;
}> {
  const s3Client = getS3Client();
  const bucketName = getS3BucketName();
  const res = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
    })
  );
  const body = res.Body;
  if (!body) {
    throw new Error("Empty S3 object");
  }
  const bytes = await body.transformToByteArray();
  return {
    buffer: Buffer.from(bytes),
    contentType: res.ContentType,
  };
}

/**
 * Upload a File object to S3 (for API routes)
 * @param file - File from FormData
 * @param tenantId - Optional tenant ID
 * @returns S3 URL of uploaded file
 */
export async function uploadFileToS3(
  file: File,
  tenantId?: string
): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return uploadToS3(buffer, file.name, file.type, tenantId);
}
