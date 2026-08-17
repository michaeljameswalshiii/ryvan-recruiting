/**
 * Tenant skills / outcome graph API
 * GET /api/talent-graph?rebuild=1
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionTenantId } from "@/lib/server-auth";
import {
  getSkillsGraphFresh,
  searchTalentGraphCandidates,
} from "@/lib/db/repositories/skills-graph-repository";

export const dynamic = "force-dynamic";

/**
 * GET /api/talent-graph
 * Returns skills graph; rebuilds if stale (>24h) or ?rebuild=1
 */
export async function GET(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json(
        { error: "Unauthorized - no tenant found" },
        { status: 401 }
      );
    }

    const rebuildParam =
      request.nextUrl.searchParams.get("rebuild") ||
      request.nextUrl.searchParams.get("force");
    const forceRebuild =
      rebuildParam === "1" ||
      rebuildParam === "true" ||
      rebuildParam === "yes";

    const query = String(request.nextUrl.searchParams.get("q") || "").trim();
    const selectedTags = [
      ...request.nextUrl.searchParams.getAll("tag"),
      ...(request.nextUrl.searchParams.get("tags") || "").split(","),
    ]
      .map((tag) => tag.trim())
      .filter(Boolean);
    const limit = Number(request.nextUrl.searchParams.get("limit") || 50);

    const graphPromise = getSkillsGraphFresh(tenantId, {
      rebuild: forceRebuild,
    });
    const searchPromise =
      query || selectedTags.length > 0
        ? searchTalentGraphCandidates(tenantId, {
            query,
            tags: selectedTags,
            limit,
          })
        : Promise.resolve({ candidates: [], total: 0 });
    const [{ graph, rebuilt }, search] = await Promise.all([
      graphPromise,
      searchPromise,
    ]);

    return NextResponse.json({
      graph,
      rebuilt,
      search,
      tenantId,
    });
  } catch (error) {
    console.error("[talent-graph] GET error:", error);
    return NextResponse.json(
      { error: "Failed to load talent graph" },
      { status: 500 }
    );
  }
}
