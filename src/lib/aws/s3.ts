/**
 * AWS S3 Utility
 * Server-side S3 operations for file uploads
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

// S3 client configuration
function getS3Client(): S3Client {
  const region = process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1';
  return new S3Client({ region });
}

// Get S3 bucket name from environment
function getS3BucketName(): string {
  const bucketName = process.env.AWS_S3_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('AWS_S3_BUCKET_NAME environment variable is not set');
  }
  return bucketName;
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
  
  // Fallback to S3 URL
  return `https://${bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;
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
