/**
 * GET /api/tenant/audit — security audit log for this tenant (company_admin+)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthSession,
  isAdminAuthError,
} from "@/lib/admin-auth";
import {
  requireTenantId,
  requireTeamAdmin,
  isAuthError,
} from "@/lib/tenant-guard";
import { listSecurityAudit } from "@/lib/security/audit";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;

    const teamOk = requireTeamAdmin(auth);
    if (isAuthError(teamOk)) return teamOk;

    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const limit = Math.min(
      Number(request.nextUrl.searchParams.get("limit") || 50),
      200
    );

    const events = await listSecurityAudit(tenantId, { limit });
    return NextResponse.json({ events });
  } catch (e) {
    console.error("[GET /api/tenant/audit]", e);
    return NextResponse.json({ error: "Failed to load audit" }, { status: 500 });
  }
}
