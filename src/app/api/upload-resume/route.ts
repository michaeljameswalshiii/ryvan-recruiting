import { NextRequest, NextResponse } from 'next/server';
import { uploadFileToS3 } from '@/lib/aws/s3';

// Supported file types
const SUPPORTED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const SUPPORTED_EXTENSIONS = ['.pdf', '.docx'];

/**
 * Upload Resume API
 * Accepts file upload and stores in S3
 */
export async function POST(req: NextRequest) {
  console.log('upload-resume: starting');
  
  try {
    const formData = await req.formData();
    const file = formData.get('resume') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
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

    // Upload to S3
    const resumeUrl = await uploadFileToS3(file);

    console.log('upload-resume: uploaded successfully', resumeUrl);

    return NextResponse.json({
      success: true,
      resumeUrl,
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
