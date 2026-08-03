/**
 * POST /api/auth/mfa/verify
 * Complete Cognito SOFTWARE_TOKEN_MFA / SMS_MFA challenge and set sealed session.
 */

import { NextRequest, NextResponse } from "next/server";
import { completeMfaChallenge, setSessionCookie } from "@/lib/server-auth";
import { normalizeRole } from "@/lib/roles";
import { resolveUserRole } from "@/lib/admin-auth";
import {
  writeSecurityAudit,
  requestAuditMeta,
} from "@/lib/security/audit";

export async function POST(request: NextRequest) {
  const meta = requestAuditMeta(request);
  try {
    const body = await request.json();
    const email = String(body.email || "").trim();
    const code = String(body.code || "").trim();
    const session = String(body.session || "");
    const challengeName = String(
      body.challengeName || "SOFTWARE_TOKEN_MFA"
    );
    const username = String(body.username || email).trim();

    if (!email || !code || !session) {
      return NextResponse.json(
        { error: "Email, code, and session are required" },
        { status: 400 }
      );
    }

    const result = await completeMfaChallenge({
      email,
      username,
      session,
      challengeName,
      code,
    });

    const role =
      (await resolveUserRole(result.userId, result.email)) ||
      normalizeRole(result.role);

    void writeSecurityAudit({
      tenantId: result.tenantId || "unknown",
      action: "auth.mfa.success",
      actorUserId: result.userId,
      actorEmail: result.email,
      actorRole: role,
      summary: "MFA verified",
      ...meta,
    });

    return await setSessionCookie(
      NextResponse.json({
        success: true,
        user: {
          id: result.userId,
          email: result.email,
          tenantId: result.tenantId,
          role,
        },
      }),
      {
        userId: result.userId,
        email: result.email,
        tenantId: result.tenantId,
        role,
        accessToken: result.AccessToken,
        refreshToken: result.RefreshToken,
      }
    );
  } catch (err) {
    console.error("[MFA verify]", err);
    void writeSecurityAudit({
      tenantId: "unknown",
      action: "auth.mfa.failure",
      severity: "warning",
      summary: "MFA verification failed",
      ...meta,
    });
    return NextResponse.json({ error: "Invalid MFA code" }, { status: 401 });
  }
}
