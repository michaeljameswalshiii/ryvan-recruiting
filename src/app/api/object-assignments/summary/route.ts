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

    const putOwner = (
      objectId: string | undefined,
      name: string,
      row: (typeof assignments)[number],
      overwrite = false,
    ) => {
      const keys = new Set<string>();
      const raw = String(objectId || "").trim();
      if (!raw || !name) return;
      keys.add(raw);
      const tail = raw.includes("#") ? raw.split("#").pop() : "";
      if (tail) keys.add(tail);
      for (const key of keys) {
        if (!overwrite && owners[key]) continue;
        owners[key] = {
          name,
          email: row.userEmail,
          userId: row.userId,
        };
      }
    };

    for (const row of assignments) {
      if (row.role && row.role !== "owner" && row.role !== "account_manager") {
        continue;
      }
      const name = String(row.userName || row.userEmail || "").trim();
      putOwner(row.objectId, name, row);
    }
    // Fill remaining from any role if no owner/account_manager yet
    for (const row of assignments) {
      const name = String(row.userName || row.userEmail || "").trim();
      putOwner(row.objectId, name, row, false);
    }

    return NextResponse.json({ owners });
  } catch (error) {
    console.error("[ASSIGNMENT_SUMMARY]", error);
    return NextResponse.json({ owners: {} });
  }
}
