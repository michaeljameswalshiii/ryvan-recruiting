/**
 * POST /api/tenant/branding — upload careers logo (Customer Admin+)
 * multipart: file (image)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthSession,
  isAdminAuthError,
} from "@/lib/admin-auth";
import {
  requireTenantId,
  requireTeamAdmin,
  isAuthError,
} from "@/lib/tenant-guard";
import {
  getTenantById,
  updateTenant,
  withPlanDefaults,
} from "@/lib/db/repositories/tenant-repository";
import { uploadTenantBranding } from "@/lib/aws/branding-s3";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;

    const teamOk = requireTeamAdmin(auth);
    if (isAuthError(teamOk)) return teamOk;

    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { url, s3Key } = await uploadTenantBranding({
      tenantId,
      tenantSlug: tenant.subdomain || tenantId,
      buffer,
      contentType: file.type || "image/png",
      fileName: file.name || "logo.png",
      kind: "logo",
    });

    const updated = await updateTenant(tenantId, {
      logo_url: url,
      // stash key for public proxy resolution
      // @ts-expect-error optional field on tenant
      logo_s3_key: s3Key,
    } as Parameters<typeof updateTenant>[1] & { logo_s3_key?: string });

    // Persist s3 key via raw update if schema doesn't include it
    if (s3Key) {
      await updateTenant(tenantId, { logo_url: url });
      // Direct field for proxy
      try {
        const { DynamoDBClient, UpdateItemCommand } = await import(
          "@aws-sdk/client-dynamodb"
        );
        const region =
          process.env.AWS_REGION ||
          process.env.NEXT_PUBLIC_AWS_REGION ||
          "us-east-1";
        const client = new DynamoDBClient({
          region,
          credentials:
            process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
              ? {
                  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                }
              : undefined,
        });
        await client.send(
          new UpdateItemCommand({
            TableName: process.env.DYNAMODB_TENANTS_TABLE || "turnkey-tenants",
            Key: { id: { S: tenantId } },
            UpdateExpression: "SET logo_s3_key = :k, logo_url = :u",
            ExpressionAttributeValues: {
              ":k": { S: s3Key },
              ":u": { S: url },
            },
          })
        );
      } catch (e) {
        console.warn("[branding] logo_s3_key persist failed", e);
      }
    }

    return NextResponse.json({
      logo_url: url,
      s3_key: s3Key,
      tenant: updated ? withPlanDefaults(updated) : null,
    });
  } catch (error) {
    console.error("[POST /api/tenant/branding]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to upload branding",
      },
      { status: 500 }
    );
  }
}
