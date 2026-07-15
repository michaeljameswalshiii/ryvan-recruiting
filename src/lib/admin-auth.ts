/**
 * Server-side guards for privileged admin APIs.
 * @serverOnly
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/server-auth";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const region =
  process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1";

export type AdminSession = {
  userId: string;
  email: string;
  tenantId: string;
  role: string;
};

/**
 * Require an authenticated session with role === "admin".
 * Returns the admin session or a 401/403 NextResponse.
 *
 * Optional emergency kill-switch: set ADMIN_API_DISABLED=true to hard-block
 * all admin APIs regardless of role.
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

  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Prefer role from profile table; never trust client-supplied role.
  let role = "";
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
        Key: { id: { S: session.userId } },
      })
    );
    if (res.Item) {
      const profile = unmarshall(res.Item) as { role?: string };
      role = (profile.role || "").toLowerCase();
    }
  } catch (err) {
    console.error("[admin-auth] profile lookup failed:", err);
    return NextResponse.json(
      { error: "Unable to verify admin privileges" },
      { status: 503 }
    );
  }

  // Allow-list of admin emails via env (comma-separated), as extra gate for
  // production ops when role field is missing on older profiles.
  const allowlist = (process.env.ADMIN_EMAIL_ALLOWLIST || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const email = (session.email || "").toLowerCase();
  const onAllowlist = allowlist.length > 0 && allowlist.includes(email);
  const isAdmin = role === "admin" || onAllowlist;

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return {
    userId: session.userId,
    email: session.email || "",
    tenantId: session.tenantId || "",
    role: role || "admin",
  };
}

export function isAdminAuthError(
  result: AdminSession | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}
