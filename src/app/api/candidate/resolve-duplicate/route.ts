/**
 * POST /api/candidate/resolve-duplicate
 * After the add-candidate duplicate modal:
 *   action=create — persist the incoming record anyway
 *   action=merge + primary=existing — fold incoming into the ATS record
 *   action=merge + primary=incoming — create incoming, then merge ATS into it
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getSession,
  getSessionTenantId,
  getSessionUserEmail,
  getSessionUserId,
} from "@/lib/server-auth";
import { createLead } from "@/lib/db/repositories/lead-repository";
import {
  applyIncomingToExisting,
  mergeCandidates,
  toMergeSummary,
} from "@/lib/candidates/merge";
import { sanitizeCandidateCreateBody } from "@/lib/candidates/create-payload";

export async function POST(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    const userId = await getSessionUserId();
    const userEmail = await getSessionUserEmail();
    if (!tenantId || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const action = String(body.action || "").trim();
    const primary = String(body.primary || "existing").trim();
    const existingId = String(body.existingId || "").trim();
    const incomingBody = (body.incoming || body) as Record<string, unknown>;
    const fields = sanitizeCandidateCreateBody(incomingBody);

    if (!fields.name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const session = await getSession();
    const mergedBy = session?.email || session?.userId || userEmail || userId;

    if (action === "create") {
      const lead = await createLead(
        tenantId,
        fields as any,
        { userId, email: userEmail }
      );
      return NextResponse.json({
        success: true,
        action: "create",
        primaryId: lead.id,
        candidate: lead,
      });
    }

    if (action !== "merge") {
      return NextResponse.json(
        { error: "action must be create or merge" },
        { status: 400 }
      );
    }

    if (!existingId) {
      return NextResponse.json(
        { error: "existingId is required to merge" },
        { status: 400 }
      );
    }

    if (primary === "incoming") {
      const created = await createLead(
        tenantId,
        fields as any,
        { userId, email: userEmail }
      );
      const createdId = String(created.id || "");
      if (!createdId) {
        return NextResponse.json(
          { error: "Failed to create incoming candidate" },
          { status: 500 }
        );
      }
      const result = await mergeCandidates(tenantId, createdId, existingId, {
        mergedBy,
      });
      if (!result.success) {
        return NextResponse.json(
          { error: result.error || "Merge failed after creating incoming" },
          { status: 400 }
        );
      }
      return NextResponse.json({
        success: true,
        action: "merge",
        primaryId: result.primaryId,
        secondaryId: result.secondaryId,
        stats: result.stats,
        candidate: result.candidate
          ? toMergeSummary(result.candidate)
          : { id: result.primaryId },
      });
    }

    const result = await applyIncomingToExisting(
      tenantId,
      existingId,
      {
        name: fields.name,
        email: fields.email,
        phone: fields.phone,
        location: fields.location,
        title: fields.title,
        linkedin_url: fields.linkedin_url,
        resume_url: fields.resume_url,
        resume_file_name: fields.resume_file_name,
        summary: fields.summary,
        skills: fields.skills,
        tags: fields.tags,
        experience: fields.experience as any,
        education: fields.education as any,
        certifications: fields.certifications,
        salary_requirements: fields.salary_requirements,
        source: fields.source,
      },
      { mergedBy }
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to merge into existing candidate" },
        { status: result.error?.includes("not found") ? 404 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      action: "merge",
      primaryId: result.primaryId,
      stats: result.stats,
      candidate: result.candidate
        ? toMergeSummary(result.candidate)
        : { id: result.primaryId },
    });
  } catch (err: any) {
    console.error("[POST /api/candidate/resolve-duplicate]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to resolve duplicate" },
      { status: 500 }
    );
  }
}
