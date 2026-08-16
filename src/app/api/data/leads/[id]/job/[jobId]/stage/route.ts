/**
 * Application-Centric Stage Update API
 * PUT /api/data/leads/[id]/job/[jobId]/stage
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getSessionTenantId,
  getSessionUserId,
  getSession,
} from "@/lib/server-auth";
import { updateCandidateStageInJob } from "@/lib/db/repositories/lead-repository";
import { updateCandidateStageInJob as updateJobCandidateStage } from "@/lib/db/repositories/job-repository";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const { id: leadId, jobId } = await params;

    if (!leadId || !jobId) {
      return NextResponse.json(
        { error: "Candidate id and job id are required" },
        { status: 400 }
      );
    }

    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { stage } = body;

    if (!stage) {
      return NextResponse.json({ error: "Stage is required" }, { status: 400 });
    }

    const session = await getSession();
    const actor =
      session?.email || (await getSessionUserId()) || "system";

    const updated = await updateCandidateStageInJob(
      tenantId,
      leadId,
      jobId,
      stage,
      actor
    );

    if (!updated) {
      return NextResponse.json(
        { error: "Failed to update stage" },
        { status: 500 }
      );
    }

    try {
      await updateJobCandidateStage(tenantId, jobId, {
        candidateId: leadId,
        stage: stage as any,
      });
    } catch (error) {
      console.warn("[StageUpdate] Job-side stage sync failed:", error);
    }

    return NextResponse.json({ success: true, lead: updated });
  } catch (error: unknown) {
    console.error("[StageUpdate] Error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to update stage";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
