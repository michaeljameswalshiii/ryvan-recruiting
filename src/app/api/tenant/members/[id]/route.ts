/**
 * PATCH /api/tenant/members/[id] — change role or status (team_admin)
 * DELETE — soft-disable member
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthSession,
  isAdminAuthError,
} from "@/lib/admin-auth";
import {
  requireTenantId,
  requireTeamAdmin,
  assertTenantMatch,
  isAuthError,
} from "@/lib/tenant-guard";
import {
  getProfileById,
  getProfilesByTenant,
  updateProfile,
  toPublicMember,
} from "@/lib/db/repositories/profile-repository";
import {
  normalizeRole,
  TENANT_ASSIGNABLE_ROLES,
  isTenantAdminOrAbove,
  ROLES,
} from "@/lib/roles";
import { z } from "zod";

const patchSchema = z.object({
  role: z.enum([ROLES.USER, ROLES.CUSTOMER_ADMIN]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  full_name: z.string().min(1).max(100).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;

    const teamOk = requireTeamAdmin(auth);
    if (isAuthError(teamOk)) return teamOk;

    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const { id } = await context.params;
    const profile = await getProfileById(id);
    if (!profile) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const match = assertTenantMatch(auth, profile.tenant_id);
    if (isAuthError(match)) return match;

    // Customer admins cannot edit site_admin profiles
    if (
      normalizeRole(profile.role) === ROLES.SITE_ADMIN &&
      normalizeRole(auth.role) !== ROLES.SITE_ADMIN
    ) {
      return NextResponse.json({ error: "Cannot modify Site Admin" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // Prevent removing last customer_admin
    if (
      parsed.data.role === ROLES.USER ||
      parsed.data.status === "disabled"
    ) {
      const wasAdmin = isTenantAdminOrAbove(profile.role);
      if (wasAdmin) {
        const members = await getProfilesByTenant(tenantId);
        const otherAdmins = members.filter(
          (m) =>
            m.id !== id &&
            (m.status || "active") !== "disabled" &&
            isTenantAdminOrAbove(m.role)
        );
        if (otherAdmins.length === 0) {
          return NextResponse.json(
            { error: "Cannot remove or demote the last Customer Admin" },
            { status: 400 }
          );
        }
      }
    }

    if (
      parsed.data.role &&
      !TENANT_ASSIGNABLE_ROLES.includes(parsed.data.role)
    ) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const updated = await updateProfile(id, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    return NextResponse.json({ member: toPublicMember(updated) });
  } catch (error) {
    console.error("[PATCH /api/tenant/members/id]", error);
    return NextResponse.json({ error: "Failed to update member" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: Ctx) {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;

    const teamOk = requireTeamAdmin(auth);
    if (isAuthError(teamOk)) return teamOk;

    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const { id } = await context.params;
    if (id === auth.userId) {
      return NextResponse.json(
        { error: "Cannot disable your own account" },
        { status: 400 }
      );
    }

    const profile = await getProfileById(id);
    if (!profile) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const match = assertTenantMatch(auth, profile.tenant_id);
    if (isAuthError(match)) return match;

    if (isTenantAdminOrAbove(profile.role)) {
      const members = await getProfilesByTenant(tenantId);
      const otherAdmins = members.filter(
        (m) =>
          m.id !== id &&
          (m.status || "active") !== "disabled" &&
          isTenantAdminOrAbove(m.role)
      );
      if (otherAdmins.length === 0) {
        return NextResponse.json(
          { error: "Cannot disable the last Customer Admin" },
          { status: 400 }
        );
      }
    }

    const updated = await updateProfile(id, { status: "disabled" });
    if (!updated) {
      return NextResponse.json({ error: "Disable failed" }, { status: 500 });
    }

    return NextResponse.json({ member: toPublicMember(updated) });
  } catch (error) {
    console.error("[DELETE /api/tenant/members/id]", error);
    return NextResponse.json({ error: "Failed to disable member" }, { status: 500 });
  }
}
