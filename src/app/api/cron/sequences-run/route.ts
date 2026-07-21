/**
 * Cron: process due sequence steps across tenants.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>  OR  x-cron-secret: <CRON_SECRET>
 * Vercel Cron sends Authorization automatically when configured.
 *
 * Optional env:
 *   CRON_SECRET (required in prod)
 *   CRON_SEQUENCE_TENANT_IDS=comma-separated tenant ids (limit scope)
 *   CRON_SEQUENCE_DEFAULT_USER_ID=fallback user for OAuth send
 */

import { NextRequest, NextResponse } from "next/server";
import { getAllTenants } from "@/lib/db/repositories/tenant-repository";
import {
  listDueEnrollments,
  listEnrollments,
} from "@/lib/db/repositories/sequence-repository";
import { runEnrollmentStep } from "@/lib/sequences/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Allow in non-prod without secret for local testing only
    if (process.env.NODE_ENV !== "production") return true;
    return false;
  }
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const header = request.headers.get("x-cron-secret") || "";
  return bearer === secret || header === secret;
}

async function handle(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitPerTenant = Math.min(
    parseInt(request.nextUrl.searchParams.get("limit") || "15", 10) || 15,
    40
  );

  const scopeEnv = process.env.CRON_SEQUENCE_TENANT_IDS || "";
  let tenantIds: string[] = scopeEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (tenantIds.length === 0) {
    try {
      const tenants = await getAllTenants();
      tenantIds = tenants.map((t: any) => t.id || t.tenant_id).filter(Boolean);
    } catch (err) {
      console.error("[cron/sequences-run] getAllTenants failed", err);
      return NextResponse.json(
        { error: "Failed to list tenants" },
        { status: 500 }
      );
    }
  }

  // Cap tenants per invocation for serverless time limits
  const maxTenants = Math.min(tenantIds.length, 25);
  const slice = tenantIds.slice(0, maxTenants);
  const defaultUserId = process.env.CRON_SEQUENCE_DEFAULT_USER_ID || "";

  const summary: Array<{
    tenantId: string;
    due: number;
    processed: number;
    ok: number;
    fail: number;
    errors: string[];
  }> = [];

  let totalOk = 0;
  let totalFail = 0;

  for (const tenantId of slice) {
    const due = await listDueEnrollments(tenantId).catch(() => []);
    const batch = due.slice(0, limitPerTenant);
    let ok = 0;
    let fail = 0;
    const errors: string[] = [];

    for (const e of batch) {
      const enrolledBy =
        (e as any).enrolledByUserId ||
        defaultUserId ||
        "";
      if (!enrolledBy) {
        fail += 1;
        errors.push(
          `${e.id}: no enrolledByUserId (re-enroll or set CRON_SEQUENCE_DEFAULT_USER_ID)`
        );
        continue;
      }

      try {
        const result = await runEnrollmentStep({
          tenantId,
          userId: enrolledBy,
          enrollmentId: e.id,
          force: false,
        });
        if (result.success) {
          ok += 1;
        } else {
          fail += 1;
          if (result.message) errors.push(`${e.id}: ${result.message}`);
        }
      } catch (err: any) {
        fail += 1;
        errors.push(`${e.id}: ${err?.message || "error"}`);
      }
    }

    totalOk += ok;
    totalFail += fail;
    summary.push({
      tenantId,
      due: due.length,
      processed: batch.length,
      ok,
      fail,
      errors: errors.slice(0, 5),
    });
  }

  return NextResponse.json({
    success: true,
    tenantsScanned: slice.length,
    totalOk,
    totalFail,
    summary,
    note:
      "Email steps require enrolledByUserId with Gmail/Outlook connected. Task steps do not.",
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
