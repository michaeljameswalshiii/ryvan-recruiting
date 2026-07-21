/**
 * Cron: poll inboxes for sequence replies across tenants.
 * Auth: Bearer CRON_SECRET
 *
 * Uses CRON_SEQUENCE_DEFAULT_USER_ID or per-enrollment enrolledByUserId.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAllTenants } from "@/lib/db/repositories/tenant-repository";
import { listEnrollments } from "@/lib/db/repositories/sequence-repository";
import { pollSequenceReplies } from "@/lib/sequences/reply-poll";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
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

  const scopeEnv = process.env.CRON_SEQUENCE_TENANT_IDS || "";
  let tenantIds: string[] = scopeEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!tenantIds.length) {
    try {
      const tenants = await getAllTenants();
      tenantIds = tenants.map((t: any) => t.id || t.tenant_id).filter(Boolean);
    } catch {
      return NextResponse.json(
        { error: "Failed to list tenants" },
        { status: 500 }
      );
    }
  }

  const defaultUserId = process.env.CRON_SEQUENCE_DEFAULT_USER_ID || "";
  const slice = tenantIds.slice(0, 15);
  const summary: Array<Record<string, unknown>> = [];
  let totalReplies = 0;

  for (const tenantId of slice) {
    const enrollments = await listEnrollments(tenantId).catch(() => []);
    const active = enrollments.filter((e) => e.status === "active");
    const userIds = new Set<string>();
    for (const e of active) {
      if ((e as any).enrolledByUserId) {
        userIds.add((e as any).enrolledByUserId);
      }
    }
    if (defaultUserId) userIds.add(defaultUserId);
    if (userIds.size === 0) {
      summary.push({
        tenantId,
        skipped: true,
        reason: "No enrolledByUserId or CRON_SEQUENCE_DEFAULT_USER_ID",
      });
      continue;
    }

    for (const userId of Array.from(userIds).slice(0, 5)) {
      try {
        const result = await pollSequenceReplies({
          tenantId,
          userId,
          newerThanDays: 14,
          limit: 25,
        });
        totalReplies += result.repliesFound;
        summary.push({
          tenantId,
          userId,
          repliesFound: result.repliesFound,
          scanned: result.scannedEnrollments,
          errors: result.errors.slice(0, 3),
        });
      } catch (err: any) {
        summary.push({
          tenantId,
          userId,
          error: err?.message || "poll failed",
        });
      }
    }
  }

  return NextResponse.json({
    success: true,
    totalReplies,
    tenantsScanned: slice.length,
    summary,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
