import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3BucketName } from '@/lib/aws/s3';
import { updateLead } from '@/lib/db/repositories/lead-repository';

// Supported file types
const SUPPORTED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const SUPPORTED_EXTENSIONS = ['.pdf', '.docx'];

/**
 * Upload Resume API
 * Accepts file upload and stores in S3 with permanent key
 * Then stores the S3 key in DynamoDB for the candidate
 */
export async function POST(req: NextRequest) {
  console.log('upload-resume: starting');
  
  try {
    const formData = await req.formData();
    const file = formData.get('resume') as File;
    const candidateId = formData.get('candidateId') as string;
    const tenantId = formData.get('tenantId') as string || 'default';
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!candidateId) {
      return NextResponse.json(
        { error: 'Candidate ID is required' },
        { status: 400 }
      );
    }

    // Validate file type
    const fileType = file.type?.toLowerCase() || '';
    const fileNameLower = file.name.toLowerCase();
    const hasValidExtension = SUPPORTED_EXTENSIONS.some(ext => fileNameLower.endsWith(ext));
    const hasValidType = SUPPORTED_TYPES.includes(fileType);

    if (!hasValidExtension && !hasValidType) {
      console.log('upload-resume: unsupported file type', file.type, file.name);
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload PDF or Word (.docx) files.' },
        { status: 400 }
      );
    }

    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    console.log('upload-resume: uploading file', file.name, file.size, file.type);

    // Generate unique S3 key with candidateId folder structure
    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const s3Key = `candidates/${candidateId}/${timestamp}-${sanitizedFileName}`;
    
const bucketName = getS3BucketName();
    const buffer = Buffer.from(await file.arrayBuffer());

    // Create S3 client
    const region = process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1';
    const s3Client = new S3Client({ region });

    // Upload directly to S3 with permanent key
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: buffer,
      ContentType: file.type,
    });
    
    await s3Client.send(putCommand);

    console.log('upload-resume: uploaded to S3', s3Key);

    // Generate a presigned URL for immediate use (expires in 1 hour)
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
    });
    const resumeUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

    // Update candidate record with permanent S3 key and metadata
    await updateLead(tenantId, candidateId, {
      resume_url: s3Key,  // Store the S3 key, not the URL
      // Note: We store resume_url as the S3 key for backward compatibility
      // The resume viewer will generate presigned URLs from this key
    } as any);

    console.log('upload-resume: saved to candidate record', candidateId, s3Key);

    return NextResponse.json({
      success: true,
      resumeUrl,
      resumeKey: s3Key,
      fileName: file.name,
    });

  } catch (error: any) {
    console.error('upload-resume error:', error);
    
    // Handle specific errors
    if (error.message?.includes('AWS_S3_BUCKET_NAME')) {
      return NextResponse.json(
        { error: 'Server configuration error. Please contact administrator.' },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to upload resume' },
      { status: 500 }
    );
  }
}
