/**
 * Application-Centric Unlink Job API
 * POST /api/data/leads/[id]/job/[jobId]/unlink
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionTenantId } from "@/lib/server-auth";
import { unlinkCandidateFromJobForApplication } from "@/lib/db/repositories/lead-repository";

export async function POST(
  _request: NextRequest,
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

    const updated = await unlinkCandidateFromJobForApplication(
      tenantId,
      leadId,
      jobId
    );

    if (!updated) {
      return NextResponse.json({ error: "Failed to unlink job" }, { status: 500 });
    }

    return NextResponse.json({ success: true, lead: updated });
  } catch (error: unknown) {
    console.error("[UnlinkJob] Error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to unlink job";
    // Surface "not linked" style cases as 400
    const status = message.toLowerCase().includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
