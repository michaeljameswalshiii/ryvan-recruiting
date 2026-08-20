import { NextRequest, NextResponse } from "next/server";
import { requireAuthSession, isAdminAuthError } from "@/lib/admin-auth";
import { requireTenantId, isAuthError } from "@/lib/tenant-guard";
import {
  ASSIGNABLE_OBJECT_TYPES,
  assignUserToObject,
  listObjectAssignments,
  unassignUserFromObject,
  type AssignableObjectType,
  type AssignmentRole,
} from "@/lib/db/repositories/object-assignment-repository";
import {
  getProfileById,
  getProfilesByTenant,
  toPublicMember,
} from "@/lib/db/repositories/profile-repository";
import { getLeadById } from "@/lib/db/repositories/lead-repository";
import { getJobById } from "@/lib/db/repositories/job-repository";
import { getClientById } from "@/lib/db/repositories/client-repository";
import { getAllContactsForTenant } from "@/lib/db/repositories/contact-repository";

const ASSIGNMENT_ROLES = new Set<AssignmentRole>([
  "owner",
  "account_manager",
  "recruiter",
  "collaborator",
]);

function parseObjectType(value: string): AssignableObjectType | null {
  return ASSIGNABLE_OBJECT_TYPES.includes(value as AssignableObjectType)
    ? (value as AssignableObjectType)
    : null;
}

async function objectExists(
  tenantId: string,
  objectType: AssignableObjectType,
  objectId: string,
) {
  if (objectType === "candidate") return Boolean(await getLeadById(tenantId, objectId));
  if (objectType === "job") return Boolean(await getJobById(tenantId, objectId));
  if (objectType === "company") return Boolean(await getClientById(tenantId, objectId));
  const contacts = await getAllContactsForTenant(tenantId);
  return contacts.some((contact) => String(contact.id) === objectId);
}

async function context(params: Promise<{ objectType: string; objectId: string }>) {
  const auth = await requireAuthSession();
  if (isAdminAuthError(auth)) return { error: auth };
  const tenantId = requireTenantId(auth);
  if (isAuthError(tenantId)) return { error: tenantId };
  const values = await params;
  const objectType = parseObjectType(values.objectType);
  const objectId = String(values.objectId || "").trim();
  if (!objectType || !objectId) {
    return {
      error: NextResponse.json({ error: "Invalid object" }, { status: 400 }),
    };
  }
  if (!(await objectExists(tenantId, objectType, objectId))) {
    return {
      error: NextResponse.json({ error: "Object not found" }, { status: 404 }),
    };
  }
  return { auth, tenantId, objectType, objectId };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ objectType: string; objectId: string }> },
) {
  try {
    const ctx = await context(params);
    if ("error" in ctx) return ctx.error;
    const [assignments, profiles] = await Promise.all([
      listObjectAssignments(ctx.tenantId, ctx.objectType, ctx.objectId),
      getProfilesByTenant(ctx.tenantId),
    ]);
    const members = profiles
      .map(toPublicMember)
      .filter((member) => member.status === "active");
    const currentMembers = new Map(members.map((member) => [member.id, member]));
    return NextResponse.json({
      assignments: assignments.map((assignment) => {
        const member = currentMembers.get(assignment.userId);
        return member
          ? {
              ...assignment,
              userName: member.full_name || member.email,
              userEmail: member.email,
            }
          : assignment;
      }),
      members,
    });
  } catch (error) {
    console.error("[GET object assignments]", error);
    return NextResponse.json({ error: "Failed to load assignments" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ objectType: string; objectId: string }> },
) {
  try {
    const ctx = await context(params);
    if ("error" in ctx) return ctx.error;
    const body = await request.json();
    const userId = String(body?.userId || "").trim();
    const role = String(body?.role || "owner") as AssignmentRole;
    if (!userId || !ASSIGNMENT_ROLES.has(role)) {
      return NextResponse.json({ error: "Invalid assignment" }, { status: 400 });
    }
    const profile = await getProfileById(userId);
    if (
      !profile ||
      profile.tenant_id !== ctx.tenantId ||
      (profile.status && profile.status !== "active")
    ) {
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    }
    const assignment = await assignUserToObject({
      tenantId: ctx.tenantId,
      objectType: ctx.objectType,
      objectId: ctx.objectId,
      userId: profile.id,
      userName: profile.full_name,
      userEmail: profile.email,
      role,
      actorUserId: ctx.auth.userId,
      actorEmail: ctx.auth.email,
    });
    if (ctx.objectType === "company") {
      try {
        const { updateClient } = await import(
          "@/lib/db/repositories/client-repository"
        );
        await updateClient(ctx.tenantId, ctx.objectId, {
          ownerName: profile.full_name || profile.email,
          ownerUserId: profile.id,
          accountOwner: profile.full_name || profile.email,
        });
      } catch (stampErr) {
        console.warn("[POST object assignment] stamp company owner", stampErr);
      }
    }
    return NextResponse.json({ assignment });
  } catch (error) {
    console.error("[POST object assignment]", error);
    return NextResponse.json({ error: "Failed to assign user" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ objectType: string; objectId: string }> },
) {
  try {
    const ctx = await context(params);
    if ("error" in ctx) return ctx.error;
    const userId = String(request.nextUrl.searchParams.get("userId") || "").trim();
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    const removed = await unassignUserFromObject({
      tenantId: ctx.tenantId,
      objectType: ctx.objectType,
      objectId: ctx.objectId,
      userId,
      actorUserId: ctx.auth.userId,
      actorEmail: ctx.auth.email,
    });
    return removed
      ? NextResponse.json({ success: true })
      : NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  } catch (error) {
    console.error("[DELETE object assignment]", error);
    return NextResponse.json({ error: "Failed to remove assignment" }, { status: 500 });
  }
}
