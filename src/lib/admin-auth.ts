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
  // ADMIN_EMAIL_ALLOWLIST elevates to at least company_admin
  if (emailOnAllowlist(session.email || profile.email, "SITE_ADMIN_EMAIL_ALLOWLIST")) {
    role = "site_admin";
  } else if (
    !isTenantAdminOrAbove(role) &&
    emailOnAllowlist(session.email || profile.email, "ADMIN_EMAIL_ALLOWLIST")
  ) {
    role = "company_admin";
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
 * Require Company Admin or Site Admin (tenant-elevated tools).
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
 * Apply env allowlist elevates on top of a base role (sync — no DynamoDB).
 * Used by layout chrome so every nav click stays free of profile round-trips.
 */
export function applyRoleAllowlists(
  baseRole: string | null | undefined,
  email?: string | null
): AppRole {
  let role = normalizeRole(baseRole);
  if (email && emailOnAllowlist(email, "SITE_ADMIN_EMAIL_ALLOWLIST")) {
    return "site_admin";
  }
  if (
    email &&
    !isTenantAdminOrAbove(role) &&
    emailOnAllowlist(email, "ADMIN_EMAIL_ALLOWLIST")
  ) {
    return "company_admin";
  }
  return role;
}

/**
 * Fast path for dashboard/candidates layout chrome.
 * Prefers the role already stored on the session cookie (set at login).
 * Only hits DynamoDB when the cookie has no role (legacy sessions).
 */
export async function resolveLayoutRole(session: {
  userId: string;
  email?: string;
  role?: string;
}): Promise<AppRole> {
  // Cookie role is written at login via resolveUserRole — trust it for chrome.
  // Allowlists still re-apply so env elevates work without re-login.
  if (session.role) {
    return applyRoleAllowlists(session.role, session.email);
  }
  return resolveUserRole(session.userId, session.email);
}

/** Short TTL cache so rare DynamoDB role lookups don't thrash under soft nav. */
const roleCache = new Map<string, { role: AppRole; expires: number }>();
const ROLE_CACHE_TTL_MS = 60_000;

/**
 * Resolve role for session cookie / layout (profile + allowlists).
 * Prefer resolveLayoutRole for UI chrome — this is for login + privileged APIs.
 */
export async function resolveUserRole(
  userId: string,
  email?: string
): Promise<AppRole> {
  const cacheKey = `${userId}|${(email || "").toLowerCase()}`;
  const hit = roleCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) {
    return hit.role;
  }

  const profile = await loadProfileRole(userId);
  const role = applyRoleAllowlists(profile?.role ?? "user", email);

  roleCache.set(cacheKey, { role, expires: Date.now() + ROLE_CACHE_TTL_MS });
  // Bound map size (long-running server processes)
  if (roleCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of roleCache) {
      if (v.expires <= now) roleCache.delete(k);
    }
  }
  return role;
}
