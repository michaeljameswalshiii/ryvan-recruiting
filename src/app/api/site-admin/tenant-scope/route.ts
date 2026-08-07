import { NextRequest, NextResponse } from "next/server";
import {
  isAdminAuthError,
  requireSiteAdminSession,
} from "@/lib/admin-auth";
import { getTenantById } from "@/lib/db/repositories/tenant-repository";
import { getSession, setSessionCookie } from "@/lib/server-auth";
import {
  requestAuditMeta,
  writeSecurityAudit,
} from "@/lib/security/audit";

export async function POST(request: NextRequest) {
  const auth = await requireSiteAdminSession();
  if (isAdminAuthError(auth)) return auth;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const requestedScope = String(body?.tenantScope || "").trim();
  if (!requestedScope) {
    return NextResponse.json(
      { error: "tenantScope is required" },
      { status: 400 },
    );
  }

  if (requestedScope !== "all") {
    const tenant = await getTenantById(requestedScope);
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }
  }

  const response = NextResponse.json({
    success: true,
    tenantScope: requestedScope,
  });
  await setSessionCookie(response, {
    ...session,
    role: auth.role,
    tenantScope: requestedScope,
  });

  void writeSecurityAudit({
    tenantId: session.tenantId || "platform",
    action: "admin.tenant_scope.changed",
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    targetType: "tenant_scope",
    targetId: requestedScope,
    summary:
      requestedScope === "all"
        ? "Site Admin selected All Tenants"
        : `Site Admin selected tenant ${requestedScope}`,
    ...requestAuditMeta(request),
  });

  return response;
}
