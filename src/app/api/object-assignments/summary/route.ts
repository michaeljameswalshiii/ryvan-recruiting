import { NextRequest, NextResponse } from "next/server";
import { requireAuthSession, isAdminAuthError } from "@/lib/admin-auth";
import { requireTenantId, isAuthError } from "@/lib/tenant-guard";
import {
  ASSIGNABLE_OBJECT_TYPES,
  listObjectAssignmentsForObjects,
  listObjectAssignmentsForType,
  type AssignableObjectType,
} from "@/lib/db/repositories/object-assignment-repository";
import { getProfilesByTenant } from "@/lib/db/repositories/profile-repository";
import { displayOwnerName } from "@/lib/ownership/machine-actor";

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

    const requestedIds = request.nextUrl.searchParams
      .getAll("id")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 400);

    const [gsiAssignments, profileRows] = await Promise.all([
      listObjectAssignmentsForType(tenantId, objectType),
      getProfilesByTenant(tenantId).catch(() => []),
    ]);

    const assignments = [...gsiAssignments];
    const seenAssignment = new Set(
      gsiAssignments.map(
        (row) => `${row.objectId || ""}#${row.userId || ""}#${row.PK || ""}`,
      ),
    );
    const missingIds = requestedIds.filter((id) => {
      const tail = id.includes("#") ? id.split("#").pop() : id;
      return !gsiAssignments.some(
        (row) =>
          row.objectId === id ||
          row.objectId === tail ||
          String(row.PK || "").endsWith(`#${id}`) ||
          String(row.PK || "").endsWith(`#${tail}`),
      );
    });
    if (missingIds.length > 0) {
      const extras = await listObjectAssignmentsForObjects(
        tenantId,
        objectType,
        missingIds,
      );
      for (const row of extras) {
        const key = `${row.objectId || ""}#${row.userId || ""}#${row.PK || ""}`;
        if (seenAssignment.has(key)) continue;
        seenAssignment.add(key);
        assignments.push(row);
      }
    }

    const profileNameById = new Map<string, string>();
    for (const profile of profileRows || []) {
      const name = displayOwnerName(profile.full_name || profile.email);
      if (profile.id && name) profileNameById.set(profile.id, name);
      if (profile.email && name) {
        profileNameById.set(String(profile.email).toLowerCase(), name);
      }
    }

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
      if (raw) keys.add(raw);
      const pk = String(row.PK || "");
      const pkTail = pk.includes("#") ? pk.split("#").pop() : "";
      if (pkTail) keys.add(pkTail);
      for (const value of [raw, pkTail]) {
        if (value && value.includes("#")) {
          const tail = value.split("#").pop();
          if (tail) keys.add(tail);
        }
      }
      if (!name || keys.size === 0) return;
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
      const name =
        displayOwnerName(row.userName || row.userEmail) ||
        profileNameById.get(row.userId) ||
        profileNameById.get(String(row.userEmail || "").toLowerCase()) ||
        "";
      putOwner(row.objectId, name, row);
    }
    // Fill remaining from any role if no owner/account_manager yet
    for (const row of assignments) {
      const name =
        displayOwnerName(row.userName || row.userEmail) ||
        profileNameById.get(row.userId) ||
        profileNameById.get(String(row.userEmail || "").toLowerCase()) ||
        "";
      putOwner(row.objectId, name, row, false);
    }

    return NextResponse.json({ owners });
  } catch (error) {
    console.error("[ASSIGNMENT_SUMMARY]", error);
    return NextResponse.json({ owners: {} });
  }
}
