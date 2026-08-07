/**
 * Sealed session cookies (JWE) — Edge + Node compatible.
 *
 * Cookie value is an encrypted JWT (A256GCM). Tampering without SESSION_SECRET fails.
 * Hard cutover: legacy plain JSON cookies are rejected.
 */

import { CompactEncrypt, compactDecrypt } from "jose";

export const SESSION_COOKIE_NAME = "turnkey-session";

/** Max session lifetime (matches cookie maxAge) */
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

export type SealedSessionPayload = {
  userId: string;
  email: string;
  tenantId: string;
  /** Site Admin acting scope: "all" or a validated tenant id. */
  tenantScope?: string;
  role?: string;
  /** Cognito access token (optional; may be empty if too large) */
  accessToken?: string;
  refreshToken?: string;
  /** Issued-at (unix seconds) */
  iat: number;
  /** Expiry (unix seconds) */
  exp: number;
};

function getSecretMaterial(): string {
  const secret =
    process.env.SESSION_SECRET ||
    process.env.AI_CREDENTIALS_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "";
  if (secret && secret.length >= 16) return secret;
  // Dev-only fallback — production must set SESSION_SECRET
  if (process.env.NODE_ENV !== "production") {
    return "trio-dev-session-secret-change-me-32b";
  }
  throw new Error(
    "SESSION_SECRET is required in production (min 16 chars). Set it in Vercel env."
  );
}

/** Derive a 256-bit key from the secret string (stable across deploys). */
async function getEncryptionKey(): Promise<Uint8Array> {
  const material = getSecretMaterial();
  const data = new TextEncoder().encode(material);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hash);
}

/**
 * Encrypt session payload → compact JWE string for the cookie.
 */
export async function sealSession(
  session: Omit<SealedSessionPayload, "iat" | "exp"> & {
    iat?: number;
    exp?: number;
  }
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SealedSessionPayload = {
    userId: session.userId,
    email: session.email || "",
    tenantId: session.tenantId || "",
    tenantScope: session.tenantScope || undefined,
    role: session.role,
    accessToken: session.accessToken || "",
    refreshToken: session.refreshToken || "",
    iat: session.iat ?? now,
    exp: session.exp ?? now + SESSION_MAX_AGE_SEC,
  };

  if (!payload.userId) {
    throw new Error("Cannot seal session without userId");
  }

  // Drop tokens if payload would bloat the cookie (>~3.5KB encrypted risk)
  let body = JSON.stringify(payload);
  if (body.length > 2800) {
    payload.accessToken = "";
    body = JSON.stringify(payload);
  }
  if (body.length > 2800) {
    payload.refreshToken = payload.refreshToken
      ? payload.refreshToken.slice(0, 500)
      : "";
    body = JSON.stringify(payload);
  }

  const key = await getEncryptionKey();
  const jwe = await new CompactEncrypt(new TextEncoder().encode(body))
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .encrypt(key);

  return jwe;
}

/**
 * Decrypt + validate cookie value. Returns null if invalid, expired, or legacy JSON.
 */
export async function unsealSession(
  token: string | undefined | null
): Promise<SealedSessionPayload | null> {
  if (!token || typeof token !== "string") return null;

  // Reject legacy plain JSON sessions (hard cutover)
  const trimmed = token.trim();
  if (trimmed.startsWith("{")) {
    return null;
  }

  try {
    const key = await getEncryptionKey();
    const { plaintext } = await compactDecrypt(trimmed, key);
    const raw = JSON.parse(new TextDecoder().decode(plaintext)) as SealedSessionPayload;

    if (!raw || typeof raw !== "object" || !raw.userId) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (typeof raw.exp === "number" && raw.exp < now) {
      return null;
    }

    return {
      userId: String(raw.userId),
      email: String(raw.email || ""),
      tenantId: String(raw.tenantId || ""),
      tenantScope: raw.tenantScope ? String(raw.tenantScope) : undefined,
      role: raw.role ? String(raw.role) : undefined,
      accessToken: raw.accessToken ? String(raw.accessToken) : "",
      refreshToken: raw.refreshToken ? String(raw.refreshToken) : "",
      iat: typeof raw.iat === "number" ? raw.iat : now,
      exp: typeof raw.exp === "number" ? raw.exp : now + SESSION_MAX_AGE_SEC,
    };
  } catch {
    return null;
  }
}

/** Cookie options shared by Node route handlers and docs */
export function sessionCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    maxAge: SESSION_MAX_AGE_SEC,
    path: "/",
  };
}
