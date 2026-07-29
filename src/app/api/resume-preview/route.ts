/**
 * GET /api/resume-preview?candidateId=...&fileKey=...
 * Server-side Word (.docx) → HTML for in-app preview.
 * Avoids browser CORS failures when fetching presigned S3 URLs.
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getLeadById } from '@/lib/db/repositories/lead-repository';
import { getSession, getSessionTenantId } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getS3Client(): S3Client {
  const region =
    process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1';
  return new S3Client({ region });
}

function getBucketName(): string {
  const bucketName =
    process.env.AWS_S3_BUCKET_NAME ||
    process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('AWS_S3_BUCKET_NAME environment variable not configured');
  }
  return bucketName;
}

async function streamToBuffer(
  body: AsyncIterable<Uint8Array> | ReadableStream | Blob | undefined
): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  // AWS SDK v3 often returns a readable stream with transformToByteArray
  const anyBody = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
    transformToString?: () => Promise<string>;
  };
  if (typeof anyBody.transformToByteArray === 'function') {
    const arr = await anyBody.transformToByteArray();
    return Buffer.from(arr);
  }
  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

function extractS3KeyFromUrlOrKey(raw: string): string {
  let s3Key = raw || '';
  if (s3Key.startsWith('http')) {
    try {
      const path = new URL(s3Key).pathname.replace(/^\//, '');
      const bucket = process.env.AWS_S3_BUCKET_NAME || '';
      s3Key =
        bucket && path.startsWith(bucket + '/')
          ? path.slice(bucket.length + 1)
          : path;
    } catch {
      /* keep */
    }
  }
  return s3Key;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession().catch(() => null);
    if (!session?.userId && !(await getSessionTenantId().catch(() => null))) {
      // Still try tenant from session helpers used elsewhere
      const tenantOnly = await getSessionTenantId().catch(() => null);
      if (!tenantOnly) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const { searchParams } = new URL(req.url);
    const candidateId = searchParams.get('candidateId');
    const fileKey = searchParams.get('fileKey');
    const sessionTenant = await getSessionTenantId();
    const tenantId =
      sessionTenant ||
      session?.tenantId ||
      searchParams.get('tenantId') ||
      'default';

    if (!candidateId && !fileKey) {
      return NextResponse.json(
        { error: 'Candidate ID or fileKey is required' },
        { status: 400 }
      );
    }

    let s3Key = fileKey || '';

    if (!s3Key && candidateId) {
      const candidate = await getLeadById(tenantId, candidateId);
      if (!candidate) {
        return NextResponse.json(
          { error: 'Candidate not found' },
          { status: 404 }
        );
      }
      const c = candidate as any;
      s3Key =
        c.resume_key ||
        c.resume_s3_key ||
        c.resumeKey ||
        candidate.resume_url ||
        '';
      s3Key = extractS3KeyFromUrlOrKey(s3Key);
    } else if (s3Key) {
      s3Key = extractS3KeyFromUrlOrKey(s3Key);
    }

    if (!s3Key) {
      return NextResponse.json(
        { error: 'No resume found for this candidate' },
        { status: 404 }
      );
    }

    const lower = s3Key.toLowerCase();
    if (!lower.endsWith('.docx')) {
      return NextResponse.json(
        {
          error:
            'In-app preview supports .docx only. Download the file or re-upload as .docx / PDF.',
          code: 'unsupported_format',
        },
        { status: 415 }
      );
    }

    const bucket = getBucketName();
    const client = getS3Client();
    const obj = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: s3Key,
      })
    );

    const buffer = await streamToBuffer(obj.Body as any);
    if (!buffer.length) {
      return NextResponse.json(
        { error: 'Resume file is empty' },
        { status: 404 }
      );
    }

    // mammoth is CommonJS; dynamic import works on server
    const mammoth = await import('mammoth');
    const result = await mammoth.convertToHtml({ buffer });

    return NextResponse.json({
      success: true,
      html: result.value || '<p>(Empty document)</p>',
      messages: result.messages?.map((m) => m.message) || [],
      fileKey: s3Key,
    });
  } catch (err: any) {
    console.error('[resume-preview]', err);
    const msg = err?.message || String(err);
    if (msg.includes('NoSuchKey') || msg.includes('NotFound')) {
      return NextResponse.json(
        { error: 'Resume file not found in storage' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: msg || 'Failed to preview resume' },
      { status: 500 }
    );
  }
}
