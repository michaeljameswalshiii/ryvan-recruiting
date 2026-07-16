/**
 * Auth Login API Route
 * Server-side login using httpOnly cookies
 *
 * Falls back to simple DynamoDB auth when Cognito not configured.
 * No hard-coded demo credentials — all logins must hit Cognito or password_hash.
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

/**
 * Simple DynamoDB-based authentication (fallback when Cognito unavailable)
 */
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

  const scanResult = await client.send(
    new ScanCommand({
      TableName: profilesTable,
      FilterExpression: "email = :email",
      ExpressionAttributeValues: {
        ":email": { S: email },
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
    email,
    tenantId: tenantId || "",
    role: profile.role?.S || "user",
  };
}

/**
 * POST /api/auth/login
 * Login and set session cookie
 */
export async function POST(request: NextRequest) {
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
    // Never log passwords or full request bodies
    console.log("[LOGIN] Attempt for email:", email);

    let session: {
      userId: string;
      email: string;
      tenantId: string;
      role?: string;
      AccessToken?: string;
      RefreshToken?: string;
    };

    if (cognitoConfigured && awsCredentialsConfigured) {
      try {
        const { authenticateUser } = await import("@/lib/server-auth");
        console.log("[LOGIN] Authenticating with Cognito");
        session = await authenticateUser(email, password);
      } catch (cognitoErr: unknown) {
        const msg =
          cognitoErr instanceof Error ? cognitoErr.message : "Cognito failed";
        console.log("[LOGIN] Cognito auth failed, trying simple auth:", msg);
        session = await authenticateSimple(email, password);
      }
    } else if (awsCredentialsConfigured) {
      console.log("[LOGIN] Using simple DynamoDB auth");
      session = await authenticateSimple(email, password);
    } else {
      console.error(
        "[LOGIN] No AWS credentials or Cognito configured — cannot authenticate"
      );
      return NextResponse.json(
        { error: "Authentication not configured" },
        { status: 503 }
      );
    }

    console.log("[LOGIN] Authentication successful, userId:", session.userId);

    // Canonical role from profile + allowlists (never trust client)
    const role =
      (await resolveUserRole(session.userId, session.email)) ||
      normalizeRole(session.role);

    const sessionData = {
      userId: session.userId || "",
      email: session.email || "",
      tenantId: session.tenantId || "",
      role,
      accessToken: session.AccessToken || "",
      refreshToken: session.RefreshToken || "",
    };

    return setSessionCookie(
      NextResponse.json({
        success: true,
        user: {
          id: session.userId,
          email: session.email,
          tenantId: session.tenantId,
          role,
        },
      }),
      sessionData
    );
  } catch (error: unknown) {
    console.error("[LOGIN] Error:", error instanceof Error ? error.message : error);

    // Generic message — do not leak whether user exists or internal errors
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
}
