/**
 * GET /api/auth/invite?token= — validate invite token (public)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getProfileByInviteTokenHash,
} from "@/lib/db/repositories/profile-repository";
import { getTenantById } from "@/lib/db/repositories/tenant-repository";
import {
  hashInviteToken,
  isInviteExpired,
} from "@/lib/tenant/invites";
import { roleLabel } from "@/lib/roles";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token") || "";
    if (!token || token.length < 16) {
      return NextResponse.json({ error: "Invalid invite" }, { status: 400 });
    }

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

    const tenant = await getTenantById(profile.tenant_id);

    return NextResponse.json({
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
      role_label: roleLabel(profile.role),
      tenant_name: tenant?.name || "Organization",
      expires_at: profile.invite_expires_at,
    });
  } catch (error) {
    console.error("[GET /api/auth/invite]", error);
    return NextResponse.json({ error: "Failed to validate invite" }, { status: 500 });
  }
}
