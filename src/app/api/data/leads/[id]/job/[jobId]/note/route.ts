/**
 * Application-Centric Job-Specific Note API
 * POST /api/data/leads/[id]/job/[jobId]/note
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionTenantId, getSessionUserId, getSession } from "@/lib/server-auth";
import { addJobSpecificNote } from "@/lib/db/repositories/lead-repository";

export async function POST(
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
    const { content, relatedStage } = body;

    if (!content) {
      return NextResponse.json(
        { error: "Note content is required" },
        { status: 400 }
      );
    }

    const session = await getSession();
    const userId =
      session?.email || (await getSessionUserId()) || "system";

    const updated = await addJobSpecificNote(
      tenantId,
      leadId,
      jobId,
      content,
      userId,
      undefined,
      relatedStage
    );

    if (!updated) {
      return NextResponse.json({ error: "Failed to add note" }, { status: 500 });
    }

    return NextResponse.json({ success: true, lead: updated });
  } catch (error: unknown) {
    console.error("[JobNoteAdd] Error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to add note";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
