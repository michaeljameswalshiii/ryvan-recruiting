/**
 * Server-side guards for privileged APIs.
 * @serverOnly
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/server-auth";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import {
  normalizeRole,
  isSiteAdmin,
  isTenantAdminOrAbove,
  type AppRole,
} from "@/lib/roles";

const region =
  process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1";

export type AuthSession = {
  userId: string;
  email: string;
  tenantId: string;
  role: AppRole;
};

export type AdminSession = AuthSession;

async function loadProfileRole(
  userId: string
): Promise<{ role: AppRole; email: string; tenantId: string } | null> {
  try {
    const profilesTable =
      process.env.DYNAMODB_PROFILES_TABLE || "turnkey-profiles";
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
    const res = await client.send(
      new GetItemCommand({
        TableName: profilesTable,
        Key: { id: { S: userId } },
      })
    );
    if (!res.Item) return null;
    const profile = unmarshall(res.Item) as {
      role?: string;
      email?: string;
      tenant_id?: string;
    };
    return {
      role: normalizeRole(profile.role),
      email: profile.email || "",
      tenantId: profile.tenant_id || "",
    };
  } catch (err) {
    console.error("[admin-auth] profile lookup failed:", err);
    return null;
  }
}

function emailOnAllowlist(
  email: string,
  envKey: "SITE_ADMIN_EMAIL_ALLOWLIST" | "ADMIN_EMAIL_ALLOWLIST"
): boolean {
  const list = (process.env[envKey] || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 && list.includes(email.toLowerCase());
}

/**
 * Load authenticated user + normalized role from profile (never trust client).
 */
export async function requireAuthSession(): Promise<
  AuthSession | NextResponse
> {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await loadProfileRole(session.userId);
  if (!profile) {
    // Cookie may still be valid; fall back to session role if present
    const cookieRole = normalizeRole(
      (session as { role?: string }).role
    );
    return {
      userId: session.userId,
      email: session.email || "",
      tenantId: session.tenantId || "",
      role: cookieRole,
    };
  }

  let role = profile.role;

  // SITE_ADMIN_EMAIL_ALLOWLIST elevates to site_admin
  // ADMIN_EMAIL_ALLOWLIST elevates to at least customer_admin (legacy)
  if (emailOnAllowlist(session.email || profile.email, "SITE_ADMIN_EMAIL_ALLOWLIST")) {
    role = "site_admin";
  } else if (
    !isTenantAdminOrAbove(role) &&
    emailOnAllowlist(session.email || profile.email, "ADMIN_EMAIL_ALLOWLIST")
  ) {
    role = "customer_admin";
  }

  return {
    userId: session.userId,
    email: session.email || profile.email || "",
    tenantId: session.tenantId || profile.tenantId || "",
    role,
  };
}

/**
 * Require Site Admin (multi-tenant / platform tools).
 * Used by DynamoDB admin API and other cross-tenant endpoints.
 */
export async function requireSiteAdminSession(): Promise<
  AdminSession | NextResponse
> {
  if (process.env.ADMIN_API_DISABLED === "true") {
    return NextResponse.json(
      { error: "Admin API is disabled" },
      { status: 403 }
    );
  }

  const auth = await requireAuthSession();
  if (auth instanceof NextResponse) return auth;

  if (!isSiteAdmin(auth.role)) {
    return NextResponse.json({ error: "Forbidden — Site Admin only" }, { status: 403 });
  }

  return auth;
}

/**
 * Require Customer Admin or Site Admin (tenant-elevated tools).
 * Prefer requireSiteAdminSession for multi-tenant data access.
 */
export async function requireAdminSession(): Promise<
  AdminSession | NextResponse
> {
  if (process.env.ADMIN_API_DISABLED === "true") {
    return NextResponse.json(
      { error: "Admin API is disabled" },
      { status: 403 }
    );
  }

  const auth = await requireAuthSession();
  if (auth instanceof NextResponse) return auth;

  // Multi-tenant Dynamo admin still requires site admin via requireSiteAdminSession
  // This legacy helper = tenant admin or above
  if (!isTenantAdminOrAbove(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return auth;
}

export function isAdminAuthError(
  result: AdminSession | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}

/**
 * Resolve role for session cookie / layout (profile + allowlists).
 */
export async function resolveUserRole(
  userId: string,
  email?: string
): Promise<AppRole> {
  const profile = await loadProfileRole(userId);
  let role = profile?.role ?? "user";

  if (email && emailOnAllowlist(email, "SITE_ADMIN_EMAIL_ALLOWLIST")) {
    return "site_admin";
  }
  if (
    email &&
    !isTenantAdminOrAbove(role) &&
    emailOnAllowlist(email, "ADMIN_EMAIL_ALLOWLIST")
  ) {
    return "customer_admin";
  }
  return role;
}
