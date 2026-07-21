/**
 * Tenant skills / outcome graph API
 * GET /api/talent-graph?rebuild=1
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionTenantId } from "@/lib/server-auth";
import { getSkillsGraphFresh } from "@/lib/db/repositories/skills-graph-repository";

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

    const { graph, rebuilt } = await getSkillsGraphFresh(tenantId, {
      rebuild: forceRebuild,
    });

    return NextResponse.json({
      graph,
      rebuilt,
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
