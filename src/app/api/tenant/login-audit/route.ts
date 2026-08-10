/**
 * GET /api/tenant/login-audit
 * Login / logout history for the current tenant (company_admin+).
 *
 * Never returns passwords — only email, time, result, method, IP, UA.
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

const LOGIN_ACTIONS = [
  "auth.login.success",
  "auth.login.failure",
  "auth.logout",
  "auth.mfa.challenge",
  "auth.mfa.success",
  "auth.mfa.failure",
];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;

    const teamOk = requireTeamAdmin(auth);
    if (isAuthError(teamOk)) return teamOk;

    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const limit = Math.min(
      Number(request.nextUrl.searchParams.get("limit") || 100),
      300
    );
    const emailQ = (request.nextUrl.searchParams.get("email") || "")
      .trim()
      .toLowerCase();

    const events = await listSecurityAudit(tenantId, {
      limit,
      actions: LOGIN_ACTIONS,
    });

    const filtered = emailQ
      ? events.filter((e) =>
          String(e.actorEmail || "")
            .toLowerCase()
            .includes(emailQ)
        )
      : events;

    const rows = filtered.map((e) => {
      const action = String(e.action || "");
      let result: "success" | "failure" | "logout" | "mfa" | "other" = "other";
      if (action === "auth.login.success" || action === "auth.mfa.success") {
        result = "success";
      } else if (
        action === "auth.login.failure" ||
        action === "auth.mfa.failure"
      ) {
        result = "failure";
      } else if (action === "auth.logout") {
        result = "logout";
      } else if (action === "auth.mfa.challenge") {
        result = "mfa";
      }

      const meta =
        e.meta && typeof e.meta === "object"
          ? (e.meta as Record<string, unknown>)
          : {};
      const authMethod =
        meta.authMethod ||
        (action.startsWith("auth.login") || action.startsWith("auth.mfa")
          ? "password"
          : "—");
      const approximate = meta.approximate === true || meta.historical === true;

      return {
        id: e.id,
        createdAt: e.createdAt,
        email: e.actorEmail || "—",
        role: e.actorRole || "—",
        action,
        result,
        /** Human label for credentials type — never the password value */
        credentialType:
          authMethod === "password" ? "Email + password" : String(authMethod),
        summary: e.summary || "",
        ip: e.ip || "—",
        userAgent: e.userAgent || "—",
        approximate: Boolean(approximate),
      };
    });

    return NextResponse.json({
      events: rows,
      note: "Passwords are never stored in the audit log.",
    });
  } catch (e) {
    console.error("[GET /api/tenant/login-audit]", e);
    return NextResponse.json(
      { error: "Failed to load login audit" },
      { status: 500 }
    );
  }
}
