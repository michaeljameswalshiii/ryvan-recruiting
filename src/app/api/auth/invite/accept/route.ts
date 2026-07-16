/**
 * POST /api/auth/invite/accept — set password and activate
 */

import { NextRequest, NextResponse } from "next/server";
import { hashSync } from "bcryptjs";
import { z } from "zod";
import {
  getProfileByInviteTokenHash,
  updateProfile,
} from "@/lib/db/repositories/profile-repository";
import {
  hashInviteToken,
  isInviteExpired,
} from "@/lib/tenant/invites";
import { setSessionCookie } from "@/lib/server-auth";
import { normalizeRole } from "@/lib/roles";

const acceptSchema = z.object({
  token: z.string().min(16),
  password: z.string().min(8).max(128),
  full_name: z.string().min(1).max(100).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = acceptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const { token, password, full_name } = parsed.data;
    const profile = await getProfileByInviteTokenHash(hashInviteToken(token));

    if (!profile || (profile.status || "") !== "invited") {
      return NextResponse.json(
        { error: "Invite not found or already used" },
        { status: 404 }
      );
    }

    if (isInviteExpired(profile.invite_expires_at)) {
      return NextResponse.json({ error: "Invite expired" }, { status: 410 });
    }

    const password_hash = hashSync(password, 10);
    const updated = await updateProfile(profile.id, {
      status: "active",
      password_hash,
      full_name: full_name || profile.full_name,
      invite_token_hash: null,
      invite_expires_at: null,
    });

    if (!updated) {
      return NextResponse.json({ error: "Activation failed" }, { status: 500 });
    }

    const role = normalizeRole(updated.role);
    const sessionData = {
      userId: updated.id,
      email: updated.email,
      tenantId: updated.tenant_id,
      role,
      accessToken: "",
      refreshToken: "",
    };

    return setSessionCookie(
      NextResponse.json({
        success: true,
        user: {
          id: updated.id,
          email: updated.email,
          tenantId: updated.tenant_id,
          role,
        },
      }),
      sessionData
    );
  } catch (error) {
    console.error("[POST /api/auth/invite/accept]", error);
    return NextResponse.json({ error: "Failed to accept invite" }, { status: 500 });
  }
}
