/**
 * POST /api/candidate/merge
 * Body: { primaryId, secondaryId }
 * Merges secondary into primary (primary id kept). Secondary deleted.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionTenantId, getSession } from "@/lib/server-auth";
import {
  mergeCandidates,
  suggestPrimaryByCreatedDate,
  toMergeSummary,
} from "@/lib/candidates/merge";
import { getLeadById } from "@/lib/db/repositories/lead-repository";

export async function POST(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    let primaryId = String(body.primaryId || body.keepId || "").trim();
    let secondaryId = String(body.secondaryId || body.removeId || "").trim();

    // Optional: pass both ids + preferOlder=true to auto-pick primary by created date
    if (
      body.candidateIdA &&
      body.candidateIdB &&
      (!primaryId || !secondaryId)
    ) {
      const a = await getLeadById(tenantId, String(body.candidateIdA));
      const b = await getLeadById(tenantId, String(body.candidateIdB));
      if (!a || !b) {
        return NextResponse.json(
          { error: "One or both candidates not found" },
          { status: 404 }
        );
      }
      const suggested = suggestPrimaryByCreatedDate(a, b);
      if (body.preferNewer === true) {
        primaryId = suggested.secondaryId;
        secondaryId = suggested.primaryId;
      } else {
        primaryId = suggested.primaryId;
        secondaryId = suggested.secondaryId;
      }
    }

    if (!primaryId || !secondaryId) {
      return NextResponse.json(
        { error: "primaryId and secondaryId are required" },
        { status: 400 }
      );
    }

    const session = await getSession();
    const mergedBy =
      session?.email || session?.userId || "user";

    const result = await mergeCandidates(
      tenantId,
      primaryId,
      secondaryId,
      { mergedBy }
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Merge failed" },
        { status: result.error?.includes("not found") ? 404 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      primaryId: result.primaryId,
      secondaryId: result.secondaryId,
      stats: result.stats,
      candidate: result.candidate
        ? toMergeSummary(result.candidate)
        : undefined,
    });
  } catch (err: any) {
    console.error("[POST /api/candidate/merge]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to merge candidates" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/candidate/merge?a=&b=
 * Preview both candidates + suggested primary (older by created date).
 */
export async function GET(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const aId = request.nextUrl.searchParams.get("a") || "";
    const bId = request.nextUrl.searchParams.get("b") || "";
    if (!aId || !bId) {
      return NextResponse.json(
        { error: "Query params a and b (candidate ids) are required" },
        { status: 400 }
      );
    }

    const a = await getLeadById(tenantId, aId);
    const b = await getLeadById(tenantId, bId);
    if (!a || !b) {
      return NextResponse.json(
        { error: "One or both candidates not found" },
        { status: 404 }
      );
    }

    const suggested = suggestPrimaryByCreatedDate(a, b);

    return NextResponse.json({
      a: toMergeSummary(a),
      b: toMergeSummary(b),
      suggestedPrimaryId: suggested.primaryId,
      suggestedSecondaryId: suggested.secondaryId,
      reason: "Older created date is suggested as primary (you can override)",
    });
  } catch (err: any) {
    console.error("[GET /api/candidate/merge]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to preview merge" },
      { status: 500 }
    );
  }
}
