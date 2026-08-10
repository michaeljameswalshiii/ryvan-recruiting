/**
 * GET /api/tenant/login-audit
 * Login / logout history.
 * - Company admin: current tenant only
 * - Site admin: all tenants (platform-wide) so emails are visible across orgs
 *
 * Always returns email (actorEmail). Never returns passwords.
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
import { isSiteAdmin } from "@/lib/roles";
import {
  listSecurityAudit,
  listSecurityAuditAll,
  type SecurityAuditEvent,
} from "@/lib/security/audit";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const LOGIN_ACTIONS = [
  "auth.login.success",
  "auth.login.failure",
  "auth.logout",
  "auth.mfa.challenge",
  "auth.mfa.success",
  "auth.mfa.failure",
];

const region =
  process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1";
const profilesTable =
  process.env.DYNAMODB_PROFILES_TABLE || "turnkey-profiles";

/** userId → email for backfilling sparse historical rows */
async function buildUserEmailMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const client = new DynamoDBClient({
      region,
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await client.send(
        new ScanCommand({
          TableName: profilesTable,
          ProjectionExpression: "id, email",
          ExclusiveStartKey: ExclusiveStartKey as any,
        })
      );
      for (const raw of res.Items || []) {
        const p = unmarshall(raw) as { id?: string; email?: string };
        const id = String(p.id || "").trim();
        const email = String(p.email || "")
          .trim()
          .toLowerCase();
        if (id && email && email.includes("@")) map.set(id, email);
      }
      ExclusiveStartKey = res.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (ExclusiveStartKey);
  } catch (e) {
    console.error("[login-audit] profile email map failed:", e);
  }
  return map;
}

function resolveEmail(
  e: SecurityAuditEvent,
  userEmails: Map<string, string>
): string {
  const direct = String(e.actorEmail || "")
    .trim()
    .toLowerCase();
  if (direct && direct.includes("@")) return direct;
  const uid = String(e.actorUserId || "").trim();
  if (uid && userEmails.has(uid)) return userEmails.get(uid)!;
  // last resort: dig meta
  const meta = e.meta && typeof e.meta === "object" ? e.meta : {};
  const fromMeta = String(
    (meta as any).email || (meta as any).actorEmail || ""
  )
    .trim()
    .toLowerCase();
  if (fromMeta.includes("@")) return fromMeta;
  return "";
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;

    const teamOk = requireTeamAdmin(auth);
    if (isAuthError(teamOk)) return teamOk;

    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const limit = Math.min(
      Number(request.nextUrl.searchParams.get("limit") || 150),
      400
    );
    const emailQ = (request.nextUrl.searchParams.get("email") || "")
      .trim()
      .toLowerCase();
    const siteWide = isSiteAdmin(auth.role);

    const events = siteWide
      ? await listSecurityAuditAll({ limit, actions: LOGIN_ACTIONS })
      : await listSecurityAudit(tenantId, { limit, actions: LOGIN_ACTIONS });

    const userEmails = await buildUserEmailMap();

    let rows = events.map((e) => {
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
      const email = resolveEmail(e, userEmails);

      return {
        id: e.id,
        createdAt: e.createdAt,
        /** Always surface login email for the audit table */
        email: email || "—",
        actorEmail: email || "—",
        role: e.actorRole || "—",
        action,
        result,
        credentialType:
          authMethod === "password" ? "Email + password" : String(authMethod),
        summary: e.summary || "",
        ip: e.ip || "—",
        userAgent: e.userAgent || "—",
        approximate: Boolean(approximate),
        tenantId: e.tenant_id || "—",
      };
    });

    if (emailQ) {
      rows = rows.filter((r) =>
        String(r.email || "")
          .toLowerCase()
          .includes(emailQ)
      );
    }

    return NextResponse.json({
      events: rows,
      scope: siteWide ? "all_tenants" : "tenant",
      tenantId,
      note: "Passwords are never stored in the audit log. Email is always shown when known.",
    });
  } catch (e) {
    console.error("[GET /api/tenant/login-audit]", e);
    return NextResponse.json(
      { error: "Failed to load login audit" },
      { status: 500 }
    );
  }
}
