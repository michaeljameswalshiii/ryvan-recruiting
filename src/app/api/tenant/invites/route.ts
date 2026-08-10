/**
 * POST /api/tenant/invites — invite member by email (team_admin)
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
  createProfile,
  getProfileByEmail,
  getProfilesByTenant,
  countBillableSeats,
  toPublicMember,
  updateProfile,
  getProfileById,
} from "@/lib/db/repositories/profile-repository";
import {
  getTenantById,
  withPlanDefaults,
} from "@/lib/db/repositories/tenant-repository";
import { inviteMemberSchema } from "@/lib/schemas/profile";
import {
  generateInviteToken,
  hashInviteToken,
  inviteExpiresAt,
  inviteAcceptUrl,
  sendInviteEmail,
} from "@/lib/tenant/invites";
import { normalizeRole, roleLabel, ROLES } from "@/lib/roles";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  writeSecurityAudit,
  requestAuditMeta,
} from "@/lib/security/audit";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthSession();
    if (isAdminAuthError(auth)) return auth;

    const teamOk = requireTeamAdmin(auth);
    if (isAuthError(teamOk)) return teamOk;

    const tenantId = requireTenantId(auth);
    if (isAuthError(tenantId)) return tenantId;

    const rl = checkRateLimit(`invite:${auth.userId}`);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many invites. Try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = inviteMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const email = parsed.data.email.toLowerCase();
    // Canonical: user | company_admin (legacy customer_admin normalized)
    const role = normalizeRole(parsed.data.role || ROLES.USER);
    if (role === ROLES.SITE_ADMIN) {
      return NextResponse.json(
        { error: "Cannot invite as System Admin from team settings" },
        { status: 400 }
      );
    }

    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }
    const enriched = withPlanDefaults(tenant);
    if (enriched.status === "suspended" || enriched.status === "cancelled") {
      return NextResponse.json(
        { error: "Tenant is not active — cannot invite" },
        { status: 403 }
      );
    }

    const members = await getProfilesByTenant(tenantId);
    const existing = await getProfileByEmail(email);

    // Seat check: re-inviting disabled/invited doesn't add a new seat if already counted
    const alreadyBillable =
      existing &&
      existing.tenant_id === tenantId &&
      ["active", "invited"].includes(
        (existing.status || "active").toLowerCase()
      );
    if (
      !alreadyBillable &&
      countBillableSeats(members) >= enriched.seat_limit
    ) {
      return NextResponse.json(
        {
          error: `Seat limit reached (${enriched.seat_limit}). Upgrade plan or free a seat.`,
        },
        { status: 403 }
      );
    }

    if (existing) {
      if (existing.tenant_id !== tenantId) {
        return NextResponse.json(
          { error: "Email already registered to another organization" },
          { status: 409 }
        );
      }
      if ((existing.status || "active") === "active") {
        return NextResponse.json(
          { error: "User already on this team" },
          { status: 409 }
        );
      }
    }

    const token = generateInviteToken();
    const tokenHash = hashInviteToken(token);
    const expires = inviteExpiresAt();
    const fullName =
      parsed.data.full_name?.trim() ||
      email.split("@")[0] ||
      "New User";

    let profile;
    if (existing && existing.tenant_id === tenantId) {
      profile = await updateProfile(existing.id, {
        status: "invited",
        role,
        full_name: fullName,
        invite_token_hash: tokenHash,
        invite_expires_at: expires,
      });
    } else {
      profile = await createProfile({
        tenant_id: tenantId,
        email,
        full_name: fullName,
        role,
        status: "invited",
        invited_at: new Date().toISOString(),
        invited_by: auth.userId,
        invite_token_hash: tokenHash,
        invite_expires_at: expires,
      });
    }

    if (!profile) {
      return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
    }

    const inviteUrl = inviteAcceptUrl(token);
    const inviter = await getProfileById(auth.userId);
    const emailResult = await sendInviteEmail({
      to: email,
      tenantName: tenant.name,
      inviterName: inviter?.full_name || auth.email,
      inviteUrl,
      roleLabel: roleLabel(role),
    });

    void writeSecurityAudit({
      tenantId,
      action: "auth.invite.created",
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      targetType: "user",
      targetId: profile.id,
      summary: `Invited ${email} as ${role}`,
      meta: { role, email_sent: emailResult.sent },
      ...requestAuditMeta(request),
    });

    return NextResponse.json({
      member: toPublicMember(profile),
      invite_url: inviteUrl,
      email_sent: emailResult.sent,
      email_error: emailResult.error,
    });
  } catch (error) {
    console.error("[POST /api/tenant/invites]", error);
    return NextResponse.json({ error: "Failed to invite" }, { status: 500 });
  }
}
