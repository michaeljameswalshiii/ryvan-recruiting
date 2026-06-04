import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, getS3BucketName } from '@/lib/aws/s3';
import { getLeadById } from '@/lib/db/repositories/lead-repository';

/**
 * Resume URL API
 * Generates a fresh presigned URL for viewing a candidate's resume
 * The S3 key is stored in DynamoDB, we generate a fresh URL here
 */
export async function POST(req: NextRequest) {
  console.log('resume-url: starting');
  
  try {
    const body = await req.json();
    const { candidateId, tenantId = 'default' } = body;
    
    if (!candidateId) {
      return NextResponse.json(
        { error: 'Candidate ID is required' },
        { status: 400 }
      );
    }

    console.log('resume-url: getting resume for candidate', candidateId);

    // Get candidate record to find the S3 key
    const candidate = await getLeadById(tenantId, candidateId);
    
    if (!candidate) {
      return NextResponse.json(
        { error: 'Candidate not found' },
        { status: 404 }
      );
    }

    // The resume_url field now contains the S3 key
    const s3Key = candidate.resume_url;
    
    if (!s3Key) {
      return NextResponse.json(
        { error: 'No resume found for this candidate' },
        { status: 404 }
      );
    }

    console.log('resume-url: generating presigned URL for', s3Key);

    // Generate fresh presigned URL (expires in 1 hour)
    const bucketName = getS3BucketName();
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
    });
    const resumeUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

    console.log('resume-url: generated fresh URL');

    return NextResponse.json({
      success: true,
      resumeUrl,
    });

  } catch (error: any) {
    console.error('resume-url error:', error);
    
    return NextResponse.json(
      { error: error.message || 'Failed to get resume URL' },
      { status: 500 }
    );
  }
}
