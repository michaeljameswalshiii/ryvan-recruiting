/**
 * Auth Login API Route
 * Server-side login using httpOnly sealed session cookies.
 *
 * Supports Cognito MFA challenges (TOTP/SMS) without breaking simple auth.
 * Silent security audit on success/failure.
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/server-auth";
import { loginSchema } from "@/lib/schemas/auth";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { compareSync } from "bcryptjs";
import { normalizeRole } from "@/lib/roles";
import { resolveUserRole } from "@/lib/admin-auth";
import {
  writeSecurityAudit,
  requestAuditMeta,
} from "@/lib/security/audit";

const region =
  process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || "us-east-1";
const profilesTable =
  process.env.DYNAMODB_PROFILES_TABLE || "turnkey-profiles";

const cognitoConfigured =
  !!(
    process.env.COGNITO_CLIENT_ID || process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
  ) &&
  !!(
    process.env.COGNITO_USER_POOL_ID ||
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID
  );

const awsCredentialsConfigured = !!(
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
);

async function authenticateSimple(email: string, password: string) {
  const client = new DynamoDBClient({
    region,
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });

  const emailNorm = email.trim().toLowerCase();
  const scanResult = await client.send(
    new ScanCommand({
      TableName: profilesTable,
      FilterExpression: "email = :email",
      ExpressionAttributeValues: {
        ":email": { S: emailNorm },
      },
    })
  );

  if (!scanResult.Items || scanResult.Items.length === 0) {
    throw new Error("Invalid credentials");
  }

  const profile = scanResult.Items[0];
  const userId = profile.id?.S;
  const tenantId = profile.tenant_id?.S;
  const storedHash = profile.password_hash?.S;

  const status = (profile.status?.S || "active").toLowerCase();
  if (status === "disabled") {
    throw new Error("Account disabled");
  }
  if (status === "invited") {
    throw new Error("Accept your invite before signing in");
  }

  if (!storedHash) {
    throw new Error("No password set for this account");
  }

  if (!compareSync(password, storedHash)) {
    throw new Error("Invalid credentials");
  }

  return {
    userId: userId || "",
    email: emailNorm,
    tenantId: tenantId || "",
    role: profile.role?.S || "user",
    AccessToken: "",
    RefreshToken: "",
  };
}

/**
 * POST /api/auth/login
 */
export async function POST(request: NextRequest) {
  const meta = requestAuditMeta(request);
  let emailForAudit = "";

  try {
    const body = await request.json();
    const validated = loginSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 400 }
      );
    }

    const { email, password } = validated.data;
    emailForAudit = email;
    console.log("[LOGIN] Attempt for email:", email);

    // Cognito path
    if (cognitoConfigured && awsCredentialsConfigured) {
      try {
        const { authenticateUser } = await import("@/lib/server-auth");
        console.log("[LOGIN] Authenticating with Cognito");
        const result = await authenticateUser(email, password);

        if (result.kind === "mfa_required") {
          void writeSecurityAudit({
            tenantId: "unknown",
            action: "auth.mfa.challenge",
            actorEmail: email,
            summary: `MFA challenge (${result.challengeName})`,
            ...meta,
          });
          return NextResponse.json({
            success: false,
            mfaRequired: true,
            challengeName: result.challengeName,
            session: result.session,
            email: result.email,
            username: result.username,
          });
        }

        const role =
          (await resolveUserRole(result.userId, result.email)) ||
          normalizeRole(result.role);

        void writeSecurityAudit({
          tenantId: result.tenantId || "unknown",
          action: "auth.login.success",
          actorUserId: result.userId,
          actorEmail: result.email,
          actorRole: role,
          summary: "Login success (Cognito)",
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
            userId: result.userId || "",
            email: result.email || "",
            tenantId: result.tenantId || "",
            role,
            accessToken: result.AccessToken || "",
            refreshToken: result.RefreshToken || "",
          }
        );
      } catch (cognitoErr: unknown) {
        const msg =
          cognitoErr instanceof Error ? cognitoErr.message : "Cognito failed";
        console.log("[LOGIN] Cognito auth failed, trying simple auth:", msg);
        // fall through to simple
      }
    }

    if (!awsCredentialsConfigured) {
      console.error(
        "[LOGIN] No AWS credentials or Cognito configured — cannot authenticate"
      );
      return NextResponse.json(
        { error: "Authentication not configured" },
        { status: 503 }
      );
    }

    console.log("[LOGIN] Using simple DynamoDB auth");
    const session = await authenticateSimple(email, password);
    const role =
      (await resolveUserRole(session.userId, session.email)) ||
      normalizeRole(session.role);

    void writeSecurityAudit({
      tenantId: session.tenantId || "unknown",
      action: "auth.login.success",
      actorUserId: session.userId,
      actorEmail: session.email,
      actorRole: role,
      summary: "Login success (profile password)",
      ...meta,
    });

    return await setSessionCookie(
      NextResponse.json({
        success: true,
        user: {
          id: session.userId,
          email: session.email,
          tenantId: session.tenantId,
          role,
        },
      }),
      {
        userId: session.userId || "",
        email: session.email || "",
        tenantId: session.tenantId || "",
        role,
        accessToken: session.AccessToken || "",
        refreshToken: session.RefreshToken || "",
      }
    );
  } catch (error: unknown) {
    console.error(
      "[LOGIN] Error:",
      error instanceof Error ? error.message : error
    );
    void writeSecurityAudit({
      tenantId: "unknown",
      action: "auth.login.failure",
      severity: "warning",
      actorEmail: emailForAudit || undefined,
      summary: "Login failure",
      ...meta,
    });
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
}
