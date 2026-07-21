/**
 * GET /api/ai/tool-audit — tool call stats + recent audits for session tenant
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/server-auth";
import {
  getToolAuditStats,
  listToolAudits,
} from "@/lib/db/repositories/tool-audit-repository";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.userId || !session?.tenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = session.tenantId;
    const [statsRec, recent] = await Promise.all([
      getToolAuditStats(tenantId),
      listToolAudits(tenantId, 50),
    ]);

    return NextResponse.json({
      stats: statsRec?.tools || {},
      updatedAt: statsRec?.updatedAt || null,
      recent: recent || [],
    });
  } catch (err) {
    console.error("[GET /api/ai/tool-audit]", err);
    return NextResponse.json(
      { error: "Failed to load tool audit data" },
      { status: 500 }
    );
  }
}
