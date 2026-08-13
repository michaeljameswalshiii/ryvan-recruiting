import { NextRequest, NextResponse } from "next/server";
import { requireAuthSession, isAdminAuthError } from "@/lib/admin-auth";
import { requireTenantId, isAuthError } from "@/lib/tenant-guard";
import {
  ASSIGNABLE_OBJECT_TYPES,
  listObjectAssignmentsForType,
  type AssignableObjectType,
} from "@/lib/db/repositories/object-assignment-repository";

function parseObjectType(value: string | null): AssignableObjectType | null {
  if (!value) return null;
  return ASSIGNABLE_OBJECT_TYPES.includes(value as AssignableObjectType)
    ? (value as AssignableObjectType)
    : null;
}

/** GET /api/object-assignments/summary?objectType=company */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;
    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const objectType = parseObjectType(
      request.nextUrl.searchParams.get("objectType")
    );
    if (!objectType) {
      return NextResponse.json({ error: "objectType is required" }, { status: 400 });
    }

    const assignments = await listObjectAssignmentsForType(tenantId, objectType);
    const owners: Record<string, { name: string; email?: string; userId?: string }> =
      {};
    for (const row of assignments) {
      if (!row.objectId || owners[row.objectId]) continue;
      if (row.role && row.role !== "owner" && row.role !== "account_manager") {
        continue;
      }
      const name = String(row.userName || row.userEmail || "").trim();
      if (!name) continue;
      owners[row.objectId] = {
        name,
        email: row.userEmail,
        userId: row.userId,
      };
    }
    // Fill remaining from any role if no owner/account_manager yet
    for (const row of assignments) {
      if (!row.objectId || owners[row.objectId]) continue;
      const name = String(row.userName || row.userEmail || "").trim();
      if (!name) continue;
      owners[row.objectId] = {
        name,
        email: row.userEmail,
        userId: row.userId,
      };
    }

    return NextResponse.json({ owners });
  } catch (error) {
    console.error("[ASSIGNMENT_SUMMARY]", error);
    return NextResponse.json({ owners: {} });
  }
}
