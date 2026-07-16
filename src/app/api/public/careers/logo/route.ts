/**
 * GET /api/public/careers/logo?tenant=slug
 * Streams tenant logo from S3 (public careers branding).
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveCareersTenant } from "@/lib/careers/public";
import { getTenantById } from "@/lib/db/repositories/tenant-repository";
import { getBrandingObject } from "@/lib/aws/branding-s3";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get("tenant") || "";
    if (!slug) {
      return NextResponse.json({ error: "tenant required" }, { status: 400 });
    }

    const ctx = await resolveCareersTenant(slug);
    if (!ctx) {
      return NextResponse.json({ error: "Unknown tenant" }, { status: 404 });
    }

    const tenant = await getTenantById(ctx.tenantId);
    const key =
      (tenant as { logo_s3_key?: string } | null)?.logo_s3_key ||
      `tenants/${ctx.tenantId}/branding/logo.png`;

    // Try common extensions
    const candidates = [
      (tenant as { logo_s3_key?: string } | null)?.logo_s3_key,
      `tenants/${ctx.tenantId}/branding/logo.png`,
      `tenants/${ctx.tenantId}/branding/logo.jpg`,
      `tenants/${ctx.tenantId}/branding/logo.webp`,
      `tenants/${ctx.tenantId}/branding/logo.svg`,
    ].filter(Boolean) as string[];

    for (const s3Key of candidates) {
      const obj = await getBrandingObject(s3Key);
      if (obj) {
        return new NextResponse(Buffer.from(obj.body), {
          status: 200,
          headers: {
            "Content-Type": obj.contentType,
            "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
          },
        });
      }
    }

    return NextResponse.json({ error: "Logo not found" }, { status: 404 });
  } catch (error) {
    console.error("[public careers logo]", error);
    return NextResponse.json({ error: "Failed to load logo" }, { status: 500 });
  }
}
