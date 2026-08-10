/**
 * GET /api/ai/tool-audit — tool call stats + recent audits
 *
 * - Company user / site admin with a customer tenant selected → that tenant
 * - Site admin on All Tenants → platform-wide aggregate
 */

import { NextResponse } from "next/server";
import { getSession, getSessionTenantId } from "@/lib/server-auth";
import { isSiteAdmin, normalizeRole } from "@/lib/roles";
import {
  getToolAuditStats,
  getToolAuditStatsAll,
  listToolAudits,
  listToolAuditsAll,
} from "@/lib/db/repositories/tool-audit-repository";
import { isPlatformTenantId } from "@/lib/platform-tenant";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = normalizeRole(session.role);
    const siteAdmin = isSiteAdmin(role);
    // Prefer tenant *scope* for site admins (selected company), not home platform id
    const scopedTenantId = await getSessionTenantId();
    const homeTenantId = (session.tenantId || "").trim();

    // All Tenants mode: no operational tenant → aggregate for site admin
    if (siteAdmin && !scopedTenantId) {
      const [agg, recent] = await Promise.all([
        getToolAuditStatsAll(),
        listToolAuditsAll(80),
      ]);
      return NextResponse.json({
        scope: "all_tenants",
        tenantId: null,
        stats: agg.tools || {},
        updatedAt: agg.updatedAt,
        tenantCount: agg.tenantCount,
        recent: (recent || []).map((r) => ({
          id: r.id,
          toolName: r.toolName,
          success: r.success,
          error: r.error,
          durationMs: r.durationMs,
          resultStatus: r.resultStatus,
          paramsSummary: r.paramsSummary,
          createdAt: r.createdAt,
          userId: r.userId,
          tenantId: r.tenant_id,
        })),
        note:
          "Platform-wide view. Select a customer tenant to filter to one org.",
      });
    }

    // Prefer scoped customer tenant; never use empty platform home for CRM audits
    let tenantId = scopedTenantId || homeTenantId;
    if (isPlatformTenantId(tenantId)) {
      if (siteAdmin) {
        // Site admin stuck on platform with no scope — fall back to all
        const [agg, recent] = await Promise.all([
          getToolAuditStatsAll(),
          listToolAuditsAll(80),
        ]);
        return NextResponse.json({
          scope: "all_tenants",
          tenantId: null,
          stats: agg.tools || {},
          updatedAt: agg.updatedAt,
          tenantCount: agg.tenantCount,
          recent: (recent || []).map((r) => ({
            id: r.id,
            toolName: r.toolName,
            success: r.success,
            error: r.error,
            durationMs: r.durationMs,
            resultStatus: r.resultStatus,
            paramsSummary: r.paramsSummary,
            createdAt: r.createdAt,
            userId: r.userId,
            tenantId: r.tenant_id,
          })),
          note:
            "No customer tenant selected — showing platform-wide tool audits.",
        });
      }
      return NextResponse.json({
        error:
          "Select a customer tenant to view AI reliability (platform home has no CRM tool traffic).",
        scope: "platform",
      }, { status: 400 });
    }

    if (!tenantId) {
      return NextResponse.json(
        { error: "No tenant in session — select a tenant first" },
        { status: 400 }
      );
    }

    const [statsRec, recent] = await Promise.all([
      getToolAuditStats(tenantId),
      listToolAudits(tenantId, 50),
    ]);

    return NextResponse.json({
      scope: "tenant",
      tenantId,
      stats: statsRec?.tools || {},
      updatedAt: statsRec?.updatedAt || null,
      recent: (recent || []).map((r) => ({
        id: r.id,
        toolName: r.toolName,
        success: r.success,
        error: r.error,
        durationMs: r.durationMs,
        resultStatus: r.resultStatus,
        paramsSummary: r.paramsSummary,
        createdAt: r.createdAt,
        userId: r.userId,
        tenantId: r.tenant_id,
      })),
    });
  } catch (err) {
    console.error("[GET /api/ai/tool-audit]", err);
    return NextResponse.json(
      { error: "Failed to load tool audit data" },
      { status: 500 }
    );
  }
}
