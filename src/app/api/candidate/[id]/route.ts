/**
 * Single Candidate API Route
 * GET /api/candidate/[id]
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionTenantId, getSessionUserId } from "@/lib/server-auth";
import {
  getLeadById,
  deleteLead,
  updateLead,
  updateCandidateStageInJob,
} from "@/lib/db/repositories/lead-repository";
import { setCandidatePipelineStage } from "@/lib/candidates/stage-sync";

/**
 * GET /api/candidate/[id]
 * Get a single candidate by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Candidate ID is required" },
        { status: 400 },
      );
    }

    // Get tenant from verified session
    const tenantId = await getSessionTenantId();

    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get candidate from repository
    const candidate = await getLeadById(tenantId, id);

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ candidate });
  } catch (error) {
    console.error("[API] Failed to get candidate:", error);
    return NextResponse.json(
      { error: "Failed to get candidate" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/candidate/[id]
 * Delete a candidate
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Candidate ID is required" },
        { status: 400 },
      );
    }

    // Get tenant from verified session
    const tenantId = await getSessionTenantId();

    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify candidate exists
    const candidate = await getLeadById(tenantId, id);

    if (!candidate) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 },
      );
    }

    // Delete the candidate
    await deleteLead(tenantId, id);

    return NextResponse.json({
      success: true,
      message: "Candidate deleted successfully",
    });
  } catch (error) {
    console.error("[API] Failed to delete candidate:", error);
    return NextResponse.json(
      { error: "Failed to delete candidate" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/candidate/[id]
 * Update a candidate
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Candidate ID is required" },
        { status: 400 },
      );
    }

    // Get tenant from verified session
    const tenantId = await getSessionTenantId();

    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify candidate exists
    const existing = await getLeadById(tenantId, id);

    if (!existing) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 },
      );
    }

    // Parse body
    const body = await request.json();

    // Application-scoped stage update. Unlike a candidate-level status update,
    // this changes only the selected linked job.
    if (body.jobId && body.applicationStage) {
      const updated = await updateCandidateStageInJob(
        tenantId,
        id,
        String(body.jobId),
        String(body.applicationStage),
        (await getSessionUserId()) || "system",
      );
      return NextResponse.json({
        success: true,
        candidate: updated,
        applicationStage: body.applicationStage,
        jobId: body.jobId,
      });
    }

    // Pipeline stage: always keep status + linkedJobs[].stage in sync.
    // The candidates list prefers linked job stage — status-only updates left
    // people stuck on Identified after advancing on the detail page.
    if (
      body.status !== undefined &&
      body.status !== null &&
      body.status !== ""
    ) {
      const stageResult = await setCandidatePipelineStage(
        id,
        String(body.status),
        {
          tenantId,
        },
      );
      // Apply any remaining non-status fields (name, email, etc.)
      const { status: _status, linkedJobs: _lj, ...rest } = body;
      const hasRest = Object.keys(rest).some((k) => rest[k] !== undefined);
      const updated = hasRest
        ? await updateLead(tenantId, id, rest)
        : await getLeadById(tenantId, id);

      return NextResponse.json({
        success: true,
        candidate: updated,
        stageUpdated: stageResult.stageUpdated,
        status: stageResult.newStage || body.status,
        linkedJobsSynced: stageResult.linkedJobsSynced,
      });
    }

    // Update the candidate (non-stage fields)
    const updated = await updateLead(tenantId, id, body);

    return NextResponse.json({
      success: true,
      candidate: updated,
    });
  } catch (error) {
    console.error("[API] Failed to update candidate:", error);
    return NextResponse.json(
      { error: "Failed to update candidate" },
      { status: 500 },
    );
  }
}
