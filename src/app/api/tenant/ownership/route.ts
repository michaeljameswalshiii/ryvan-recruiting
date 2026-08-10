/**
 * GET/PATCH /api/tenant/ownership
 * Default owner for new CRM records.
 * Off by default → whoever creates the record is the owner.
 * Company admin can enable a fixed default owner (any active teammate).
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
import {
  getTenantById,
  updateTenant,
} from "@/lib/db/repositories/tenant-repository";
import {
  DEFAULT_TENANT_OWNERSHIP,
  parseTenantOwnership,
} from "@/lib/ownership/default-owner";
import {
  getProfileById,
  getProfilesByTenant,
  toPublicMember,
} from "@/lib/db/repositories/profile-repository";

export async function GET() {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;
    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const ownership = parseTenantOwnership(tenant.ownership);
    const profiles = await getProfilesByTenant(tenantId);
    const members = profiles
      .map(toPublicMember)
      .filter((m) => m.status === "active");

    let defaultOwnerLabel: string | null = null;
    if (ownership.defaultOwnerUserId) {
      const p = await getProfileById(ownership.defaultOwnerUserId);
      if (p && p.tenant_id === tenantId) {
        defaultOwnerLabel = p.full_name || p.email || p.id;
      }
    }

    return NextResponse.json({
      ownership,
      defaults: DEFAULT_TENANT_OWNERSHIP,
      members,
      defaultOwnerLabel,
    });
  } catch (e) {
    console.error("[GET /api/tenant/ownership]", e);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;

    const teamOk = requireTeamAdmin(auth);
    if (isAuthError(teamOk)) return teamOk;

    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const body = await request.json();
    const current = await getTenantById(tenantId);
    if (!current) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const prev = parseTenantOwnership(current.ownership);
    const useFixedDefaultOwner =
      typeof body.useFixedDefaultOwner === "boolean"
        ? body.useFixedDefaultOwner
        : prev.useFixedDefaultOwner;

    let defaultOwnerUserId =
      body.defaultOwnerUserId !== undefined
        ? String(body.defaultOwnerUserId || "").trim() || undefined
        : prev.defaultOwnerUserId;

    if (useFixedDefaultOwner) {
      if (!defaultOwnerUserId) {
        return NextResponse.json(
          {
            error:
              "Select a default owner when fixed default owner is enabled.",
          },
          { status: 400 },
        );
      }
      const profile = await getProfileById(defaultOwnerUserId);
      if (
        !profile ||
        profile.tenant_id !== tenantId ||
        (profile.status && profile.status !== "active")
      ) {
        return NextResponse.json(
          { error: "Default owner must be an active team member." },
          { status: 400 },
        );
      }
    } else {
      // Keep last selected person so admins can re-enable without re-picking,
      // but allow explicit clear via empty string.
      if (body.defaultOwnerUserId === "" || body.defaultOwnerUserId === null) {
        defaultOwnerUserId = undefined;
      }
    }

    const next = {
      useFixedDefaultOwner,
      defaultOwnerUserId,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.email || auth.userId,
    };

    await updateTenant(tenantId, { ownership: next });

    return NextResponse.json({ success: true, ownership: next });
  } catch (e) {
    console.error("[PATCH /api/tenant/ownership]", e);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
