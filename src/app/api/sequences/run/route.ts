/**
 * Run due sequence steps (send email / create tasks).
 * POST { enrollmentId?, force?, limit? }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getSession,
  getSessionTenantId,
  getSessionUserId,
} from "@/lib/server-auth";
import {
  runDueEnrollments,
  runEnrollmentStep,
} from "@/lib/sequences/runner";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const tenantId =
      request.headers.get("x-tenant-id") ||
      session?.tenantId ||
      (await getSessionTenantId());
    const userId =
      request.headers.get("x-user-id") ||
      session?.userId ||
      (await getSessionUserId());

    if (!tenantId || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const enrollmentId = body.enrollmentId || body.enrollment_id;
    const force = body.force === true;
    const limit =
      typeof body.limit === "number" ? body.limit : parseInt(body.limit, 10);
    const recruiterName =
      body.recruiterName ||
      session?.email ||
      undefined;

    if (enrollmentId) {
      const result = await runEnrollmentStep({
        tenantId,
        userId,
        enrollmentId,
        force,
        recruiterName,
      });
      return NextResponse.json({
        success: result.success,
        mode: "single",
        result,
      });
    }

    const batch = await runDueEnrollments({
      tenantId,
      userId,
      limit: Number.isFinite(limit) ? limit : 25,
      recruiterName,
    });

    const ok = batch.results.filter((r) => r.success).length;
    const fail = batch.results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: true,
      mode: "due",
      processed: batch.processed,
      sent: ok,
      failed: fail,
      results: batch.results,
    });
  } catch (err: any) {
    console.error("[sequences/run]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to run sequences" },
      { status: 500 }
    );
  }
}
