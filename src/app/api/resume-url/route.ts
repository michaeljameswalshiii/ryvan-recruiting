import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getLeadById } from '@/lib/db/repositories/lead-repository';

// 7 days in seconds for long-lived presigned URLs
const SEVEN_DAYS_SECONDS = 604800;

/**
 * Get S3 client for presigned URL generation
 */
function getS3Client(): S3Client {
  const region = process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1';
  return new S3Client({ region });
}

/**
 * Get S3 bucket name
 */
function getBucketName(): string {
  const bucketName = process.env.AWS_S3_BUCKET_NAME || process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('AWS_S3_BUCKET_NAME environment variable not configured');
  }
  return bucketName;
}

/**
 * Generate fresh presigned URL with 7-day expiry
 */
async function generatePresignedUrl(s3Key: string): Promise<string> {
  const s3Client = getS3Client();
  const bucketName = getBucketName();

  const getCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
  });

  // Generate fresh presigned URL with 7-day expiry
  return getSignedUrl(s3Client, getCommand, { expiresIn: SEVEN_DAYS_SECONDS });
}

/**
 * Resume URL API
 * Generates a fresh presigned URL for viewing a candidate's resume
 * Supports both GET (query param) and POST (JSON body) methods
 * Uses 7-day expiry for long-lived URLs
 */
export async function GET(req: NextRequest) {
  console.log('resume-url: GET request');

  try {
    const { searchParams } = new URL(req.url);
    const candidateId = searchParams.get('candidateId');
    const fileKey = searchParams.get('fileKey');
    const tenantId = searchParams.get('tenantId') || 'default';

    if (!candidateId && !fileKey) {
      return NextResponse.json(
        { error: 'Candidate ID or fileKey is required' },
        { status: 400 }
      );
    }

    let s3Key = fileKey || '';

// If no fileKey provided, get it from candidate record
    if (!s3Key && candidateId) {
      console.log('resume-url: getting resume for candidate', candidateId);
      const candidate = await getLeadById(tenantId, candidateId);

      if (!candidate) {
        return NextResponse.json(
          { error: 'Candidate not found' },
          { status: 404 }
        );
      }

      // Use resume_url as S3 key (stored in DB)
      s3Key = candidate.resume_url || '';
    }

    if (!s3Key) {
      return NextResponse.json(
        { error: 'No resume found for this candidate' },
        { status: 404 }
      );
    }

    console.log('resume-url: generating presigned URL for', s3Key);

    // Generate fresh presigned URL with 7-day expiry
    const resumeUrl = await generatePresignedUrl(s3Key);

    console.log('resume-url: generated fresh 7-day URL');

    return NextResponse.json({
      success: true,
      resumeUrl,
      expiresIn: SEVEN_DAYS_SECONDS,
    });

  } catch (error: any) {
    console.error('resume-url error:', error);

    return NextResponse.json(
      { error: error.message || 'Failed to get resume URL' },
      { status: 500 }
    );
  }
}

/**
 * POST method for backward compatibility
 */
export async function POST(req: NextRequest) {
  console.log('resume-url: POST request');

  try {
    const body = await req.json();
    const { candidateId, fileKey, tenantId = 'default' } = body;

    if (!candidateId && !fileKey) {
      return NextResponse.json(
        { error: 'Candidate ID or fileKey is required' },
        { status: 400 }
      );
    }

    let s3Key = fileKey || '';

    // If no fileKey provided, get it from candidate record
    if (!s3Key && candidateId) {
      console.log('resume-url: getting resume for candidate', candidateId);
      const candidate = await getLeadById(tenantId, candidateId);

      if (!candidate) {
        return NextResponse.json(
          { error: 'Candidate not found' },
          { status: 404 }
        );
      }

      // Use resume_url as S3 key (stored in DB)
      s3Key = candidate.resume_url || '';
    }

    if (!s3Key) {
      return NextResponse.json(
        { error: 'No resume found for this candidate' },
        { status: 404 }
      );
    }

    console.log('resume-url: generating presigned URL for', s3Key);

    // Generate fresh presigned URL with 7-day expiry
    const resumeUrl = await generatePresignedUrl(s3Key);

    console.log('resume-url: generated fresh 7-day URL');

    return NextResponse.json({
      success: true,
      resumeUrl,
      expiresIn: SEVEN_DAYS_SECONDS,
    });

  } catch (error: any) {
    console.error('resume-url error:', error);

    return NextResponse.json(
      { error: error.message || 'Failed to get resume URL' },
      { status: 500 }
    );
  }
}
