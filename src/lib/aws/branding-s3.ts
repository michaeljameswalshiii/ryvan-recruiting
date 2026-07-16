/**
 * Tenant branding uploads (logos) to S3 — public careers need a stable URL.
 * @serverOnly
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getS3Client(): S3Client {
  const region =
    process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1";
  return new S3Client({
    region,
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });
}

function getBucket(): string {
  const bucket =
    process.env.AWS_S3_BUCKET_NAME || process.env.NEXT_PUBLIC_AWS_S3_BUCKET_NAME;
  if (!bucket) throw new Error("AWS_S3_BUCKET_NAME is not set");
  return bucket;
}

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);

export function isBrandImageType(contentType: string, fileName: string): boolean {
  const t = (contentType || "").toLowerCase();
  if (IMAGE_TYPES.has(t)) return true;
  const n = fileName.toLowerCase();
  return (
    n.endsWith(".png") ||
    n.endsWith(".jpg") ||
    n.endsWith(".jpeg") ||
    n.endsWith(".webp") ||
    n.endsWith(".svg") ||
    n.endsWith(".gif")
  );
}

export function brandingObjectKey(
  tenantId: string,
  kind: "logo" | "banner",
  ext: string
): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "") || "png";
  return `tenants/${tenantId}/branding/${kind}.${safeExt}`;
}

/**
 * Upload logo/banner. Returns a public-facing URL:
 * CloudFront if set, else our public careers asset proxy.
 */
export async function uploadTenantBranding(opts: {
  tenantId: string;
  tenantSlug: string;
  buffer: Buffer;
  contentType: string;
  fileName: string;
  kind?: "logo" | "banner";
}): Promise<{ url: string; s3Key: string }> {
  const kind = opts.kind || "logo";
  if (!isBrandImageType(opts.contentType, opts.fileName)) {
    throw new Error("Upload a PNG, JPG, WEBP, or SVG image");
  }
  if (opts.buffer.length > 2 * 1024 * 1024) {
    throw new Error("Image too large (max 2MB)");
  }

  const lower = opts.fileName.toLowerCase();
  let ext = "png";
  if (lower.endsWith(".svg") || opts.contentType.includes("svg")) ext = "svg";
  else if (lower.endsWith(".webp") || opts.contentType.includes("webp"))
    ext = "webp";
  else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || opts.contentType.includes("jpeg"))
    ext = "jpg";
  else if (lower.endsWith(".gif")) ext = "gif";

  const s3Key = brandingObjectKey(opts.tenantId, kind, ext);
  const bucket = getBucket();
  const client = getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: opts.buffer,
      ContentType: opts.contentType || `image/${ext}`,
      CacheControl: "public, max-age=86400",
    })
  );

  const cloudfront = (process.env.CLOUDFRONT_URL || "").replace(/\/$/, "");
  if (cloudfront) {
    return { url: `${cloudfront}/${s3Key}`, s3Key };
  }

  // Public proxy — works with private buckets
  const url = `/api/public/careers/logo?tenant=${encodeURIComponent(
    opts.tenantSlug
  )}&v=${Date.now()}`;
  return { url, s3Key };
}

export async function getBrandingObject(s3Key: string): Promise<{
  body: Uint8Array;
  contentType: string;
} | null> {
  try {
    const client = getS3Client();
    const res = await client.send(
      new GetObjectCommand({
        Bucket: getBucket(),
        Key: s3Key,
      })
    );
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    return {
      body: bytes,
      contentType: res.ContentType || "image/png",
    };
  } catch {
    return null;
  }
}

/** Long-lived signed URL fallback */
export async function signedBrandingUrl(s3Key: string): Promise<string> {
  const client = getS3Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: getBucket(), Key: s3Key }),
    { expiresIn: 60 * 60 * 24 * 7 }
  );
}
