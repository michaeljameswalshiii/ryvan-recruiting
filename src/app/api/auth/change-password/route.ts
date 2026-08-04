/**
 * POST /api/auth/change-password
 *
 * Logged-in user changes their own password.
 * Supports:
 *  - Cognito (when session has accessToken) via ChangePasswordCommand
 *  - Simple DynamoDB auth (password_hash on profile) via bcrypt
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from "next/server";
import {
  CognitoIdentityProviderClient,
  ChangePasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { compareSync, hashSync } from "bcryptjs";
import { getSession } from "@/lib/server-auth";
import { changePasswordSchema } from "@/lib/schemas/auth";
import {
  getProfileById,
  updateProfile,
} from "@/lib/db/repositories/profile-repository";
import {
  writeSecurityAudit,
  requestAuditMeta,
} from "@/lib/security/audit";

const region =
  process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1";

function getAwsCredentials() {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }
  return undefined;
}

async function changeCognitoPassword(
  accessToken: string,
  previousPassword: string,
  proposedPassword: string
): Promise<void> {
  const client = new CognitoIdentityProviderClient({
    region,
    credentials: getAwsCredentials(),
  });
  await client.send(
    new ChangePasswordCommand({
      AccessToken: accessToken,
      PreviousPassword: previousPassword,
      ProposedPassword: proposedPassword,
    })
  );
}

export async function POST(request: NextRequest) {
  const auditMeta = requestAuditMeta(request);

  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      const msg =
        parsed.error.issues[0]?.message || "Invalid password payload";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { currentPassword, newPassword } = parsed.data;
    let method: "cognito" | "simple" | null = null;

    // --- Cognito path (session from Cognito login) ---
    if (session.accessToken && session.accessToken.length > 20) {
      try {
        await changeCognitoPassword(
          session.accessToken,
          currentPassword,
          newPassword
        );
        method = "cognito";
      } catch (err: unknown) {
        const name =
          err && typeof err === "object" && "name" in err
            ? String((err as { name?: string }).name)
            : "";
        const message =
          err instanceof Error ? err.message : "Cognito password change failed";

        // Wrong current password or invalid token
        if (
          name === "NotAuthorizedException" ||
          name === "LimitExceededException" ||
          /incorrect|not authorized|password/i.test(message)
        ) {
          void writeSecurityAudit({
            tenantId: session.tenantId || "unknown",
            action: "password_change_failed",
            severity: "warning",
            actorUserId: session.userId,
            actorEmail: session.email,
            summary: "Password change failed (Cognito)",
            meta: { reason: name || message.slice(0, 120), method: "cognito" },
            ...auditMeta,
          });
          return NextResponse.json(
            {
              error:
                name === "LimitExceededException"
                  ? "Too many attempts. Try again later."
                  : "Current password is incorrect",
            },
            { status: 400 }
          );
        }

        // InvalidParameter / policy
        if (name === "InvalidPasswordException" || name === "InvalidParameterException") {
          return NextResponse.json(
            {
              error:
                "New password does not meet requirements (length and complexity)",
            },
            { status: 400 }
          );
        }

        // Token may be expired — try simple path if profile has password_hash
        console.warn("[change-password] Cognito error, trying simple path:", name || message);
      }
    }

    // --- Simple DynamoDB / bcrypt path ---
    if (!method) {
      const profile = await getProfileById(session.userId);
      const storedHash = profile?.password_hash;

      if (!storedHash) {
        // Cognito-only user without usable token, or SSO-only
        if (session.accessToken) {
          return NextResponse.json(
            {
              error:
                "Could not change password. Sign out and sign back in, then try again.",
            },
            { status: 400 }
          );
        }
        return NextResponse.json(
          {
            error:
              "Password change is not available for this account. Contact your administrator if you use SSO.",
          },
          { status: 400 }
        );
      }

      if (!compareSync(currentPassword, storedHash)) {
        void writeSecurityAudit({
          tenantId: session.tenantId || profile?.tenant_id || "unknown",
          action: "password_change_failed",
          severity: "warning",
          actorUserId: session.userId,
          actorEmail: session.email,
          summary: "Password change failed (wrong current password)",
          meta: { method: "simple" },
          ...auditMeta,
        });
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 400 }
        );
      }

      const password_hash = hashSync(newPassword, 10);
      const updated = await updateProfile(session.userId, { password_hash });
      if (!updated) {
        return NextResponse.json(
          { error: "Failed to update password" },
          { status: 500 }
        );
      }
      method = "simple";
    }

    void writeSecurityAudit({
      tenantId: session.tenantId || "unknown",
      action: "password_changed",
      severity: "info",
      actorUserId: session.userId,
      actorEmail: session.email,
      summary: "User changed their password",
      meta: { method },
      ...auditMeta,
    });

    return NextResponse.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("[change-password]", error);
    return NextResponse.json(
      { error: "Failed to change password" },
      { status: 500 }
    );
  }
}
