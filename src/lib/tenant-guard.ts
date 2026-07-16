/**
 * Tenant isolation helpers for APIs.
 * Always use session.tenantId — never trust client-supplied tenant ids
 * except on Site Admin multi-tenant routes.
 * @serverOnly
 */

import { NextResponse } from "next/server";
import type { AuthSession } from "@/lib/admin-auth";
import { hasPermission, isSiteAdmin } from "@/lib/roles";

export function requireTenantId(
  session: AuthSession
): string | NextResponse {
  const tenantId = (session.tenantId || "").trim();
  if (!tenantId) {
    return NextResponse.json(
      { error: "No tenant associated with this account" },
      { status: 403 }
    );
  }
  return tenantId;
}

/** 403 if resource belongs to another tenant (Site Admin may cross tenants). */
export function assertTenantMatch(
  session: AuthSession,
  resourceTenantId: string | null | undefined
): true | NextResponse {
  if (isSiteAdmin(session.role)) return true;
  const mine = (session.tenantId || "").trim();
  const theirs = (resourceTenantId || "").trim();
  if (!mine || !theirs || mine !== theirs) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return true;
}

export function requireTeamAdmin(
  session: AuthSession
): true | NextResponse {
  if (!hasPermission(session.role, "team_admin")) {
    return NextResponse.json(
      { error: "Forbidden — Customer Admin or above required" },
      { status: 403 }
    );
  }
  return true;
}

export function requireSiteAdminTools(
  session: AuthSession
): true | NextResponse {
  if (!hasPermission(session.role, "site_admin_tools")) {
    return NextResponse.json(
      { error: "Forbidden — Site Admin only" },
      { status: 403 }
    );
  }
  return true;
}

export function isAuthError(
  result: unknown
): result is NextResponse {
  return result instanceof NextResponse;
}
