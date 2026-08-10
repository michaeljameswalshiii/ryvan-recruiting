/**
 * POST /api/jobs/[id]/copy
 * Duplicate a job: same company, JD, hiring manager, etc.
 * New Open req with empty candidate pipeline; not shown on careers by default.
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getSessionTenantId,
  getSessionUserId,
  getSessionUserEmail,
} from "@/lib/server-auth";
import { duplicateJob } from "@/lib/db/repositories/job-repository";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sourceJobId } = await params;
    const tenantId = await getSessionTenantId();
    const userId = await getSessionUserId();
    const email = await getSessionUserEmail();

    if (!tenantId || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!sourceJobId?.trim()) {
      return NextResponse.json({ error: "Job id required" }, { status: 400 });
    }

    const job = await duplicateJob(
      tenantId,
      sourceJobId.trim(),
      { userId, email },
    );

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        success: true,
        job,
        message: `Created copy: ${job.title}`,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[POST /api/jobs/[id]/copy]", error);
    return NextResponse.json(
      {
        error:
          error?.message || "Failed to copy job",
      },
      { status: 500 }
    );
  }
}
