import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { parseResumeBuffer } from '@/lib/candidates/resume-extract-server';
import {
  extractNameFromFilename,
  parseResumeText,
  type StructuredParsedResume,
} from '@/lib/candidates/resume-text-parser';

const SUPPORTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const SUPPORTED_EXTENSIONS = ['.pdf', '.docx'];
const SEVEN_DAYS_SECONDS = 604800;

function getS3Client(): S3Client {
  const region =
    process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1';
  return new S3Client({ region });
}

function getBucketName(): string {
  const bucketName =
    process.env.AWS_S3_BUCKET_NAME || process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('AWS_S3_BUCKET_NAME environment variable not configured');
  }
  return bucketName;
}

async function uploadToS3Permanent(
  buffer: Buffer,
  fileName: string,
  contentType: string,
  candidateId: string
): Promise<{ s3Key: string; presignedUrl: string }> {
  const s3Client = getS3Client();
  const bucketName = getBucketName();

  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const s3Key = `resumes/${candidateId}/${timestamp}-${sanitizedFileName}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  const getCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
  });

  const presignedUrl = await getSignedUrl(s3Client, getCommand, {
    expiresIn: SEVEN_DAYS_SECONDS,
  });

  return { s3Key, presignedUrl };
}

async function fetchGoogleDocAsText(
  docId: string
): Promise<{ text: string; error?: string }> {
  try {
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
    const response = await fetch(exportUrl, {
      method: 'GET',
      headers: { Accept: 'text/plain' },
    });

    if (!response.ok) {
      const htmlUrl = `https://docs.google.com/document/d/${docId}/export?format=html`;
      const htmlResponse = await fetch(htmlUrl);
      if (!htmlResponse.ok) {
        return { text: '', error: 'Failed to fetch Google Doc' };
      }
      const htmlText = await htmlResponse.text();
      const text = htmlText
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return { text };
    }

    const text = await response.text();
    return { text };
  } catch (err) {
    console.error('fetchGoogleDocAsText error:', err);
    return { text: '', error: 'Failed to fetch Google Doc' };
  }
}

function extractGoogleDocId(url: string): string | null {
  const match = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

function toApiResume(parsed: StructuredParsedResume) {
  return {
    name: parsed.name || '',
    title: parsed.title || '',
    email: parsed.email || '',
    phone: parsed.phone || '',
    location: parsed.location || '',
    fullAddress: parsed.fullAddress || parsed.location || '',
    linkedin: parsed.linkedin || '',
    summary: parsed.summary || '',
    salaryRequirements: parsed.salaryRequirements || '',
    skills: parsed.skills || [],
    experience: (parsed.experience || []).map((e) => ({
      company: e.company || '',
      title: e.title || '',
      dates: e.dates || '',
      description: e.description || '',
      location: e.location || '',
    })),
    education: (parsed.education || []).map((e) => ({
      school: e.school || '',
      degree: e.degree || '',
      dates: e.dates || '',
      field: e.field || '',
    })),
    certifications: parsed.certifications || [],
  };
}

export async function POST(req: NextRequest) {
  console.log('parse-resume: starting');
  let fileName = 'resume.pdf';

  try {
    const formData = await req.formData();
    const googleDocUrl = formData.get('googleDocUrl') as string;

    if (googleDocUrl) {
      console.log('parse-resume: processing Google Doc URL');
      const docId = extractGoogleDocId(googleDocUrl);
      if (!docId) {
        return NextResponse.json(
          { error: 'Invalid Google Docs URL' },
          { status: 400 }
        );
      }

      const { text: rawText, error } = await fetchGoogleDocAsText(docId);
      if (error || !rawText) {
        return NextResponse.json(
          { error: error || 'Failed to fetch Google Doc content' },
          { status: 400 }
        );
      }

      console.log('parse-resume: Google Doc fetched, chars =', rawText.length);
      const parsed = parseResumeText(rawText);
      const finalResume = toApiResume(parsed);

      console.log(
        'parse-resume: Google Doc parsed, name =',
        finalResume.name,
        'email =',
        finalResume.email,
        'exp =',
        finalResume.experience.length
      );

      return NextResponse.json({
        success: true,
        resume: finalResume,
        extractionMethod: 'google-doc',
        resumeUrl: googleDocUrl,
        fileKey: null,
      });
    }

    const file = formData.get('resume') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileType = file.type?.toLowerCase() || '';
    const fileNameLower = file.name.toLowerCase();
    const hasValidExtension = SUPPORTED_EXTENSIONS.some((ext) =>
      fileNameLower.endsWith(ext)
    );
    const hasValidType = SUPPORTED_TYPES.includes(fileType);

    if (!hasValidExtension && !hasValidType) {
      console.log('parse-resume: unsupported file type', file.type, fileName);
      return NextResponse.json(
        {
          error:
            'Unsupported file type. Please upload PDF or Word (.docx) files.',
        },
        { status: 400 }
      );
    }

    fileName = file.name;
    const buffer = Buffer.from(await file.arrayBuffer());
    console.log(
      'parse-resume: file size =',
      buffer.length,
      'name =',
      fileName,
      'type =',
      file.type
    );

    const {
      parsed,
      text: rawText,
      method: extractionMethod,
    } = await parseResumeBuffer(buffer, file.name);
    console.log(
      'parse-resume: extraction method =',
      extractionMethod,
      'chars =',
      rawText.length
    );

    const finalResume = toApiResume(parsed);

    console.log(
      'parse-resume: final name =',
      finalResume.name,
      'email =',
      finalResume.email ? 'yes' : 'no',
      'phone =',
      finalResume.phone ? 'yes' : 'no',
      'title =',
      finalResume.title,
      'skills =',
      finalResume.skills.length,
      'experience =',
      finalResume.experience.length,
      'education =',
      finalResume.education.length
    );

    let resumeUrl = '';
    let fileKey = '';
    const candidateId = formData.get('candidateId') as string;

    if (candidateId && buffer.length > 0) {
      try {
        console.log(
          'parse-resume: uploading to S3 with 7-day URL, candidateId =',
          candidateId
        );
        const s3Result = await uploadToS3Permanent(
          buffer,
          fileName,
          file.type,
          candidateId
        );
        resumeUrl = s3Result.presignedUrl;
        fileKey = s3Result.s3Key;
        console.log('parse-resume: S3 upload complete, fileKey =', fileKey);
      } catch (s3Err) {
        console.error('parse-resume: S3 upload failed:', s3Err);
      }
    }

    return NextResponse.json({
      success: true,
      resume: finalResume,
      extractionMethod: extractionMethod || 'structured',
      rawText: rawText.substring(0, 800),
      resumeUrl: resumeUrl || null,
      fileKey: fileKey || null,
    });
  } catch (error: any) {
    console.error('parse-resume error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to parse resume',
        resume: {
          name: extractNameFromFilename(fileName),
          email: '',
          phone: '',
          location: '',
          linkedin: '',
          title: '',
          summary: '',
          skills: [],
          experience: [],
          education: [],
          certifications: [],
        },
      },
      { status: 500 }
    );
  }
}
