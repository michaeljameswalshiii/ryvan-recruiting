/**
 * Security Middleware — default deny
 *
 * Pages: only explicit public routes skip auth; everything else needs a sealed session.
 * APIs: only explicit public prefixes; everything else needs a sealed session.
 * Extra gates:
 *   - /api/cron requires CRON_SECRET (Bearer or x-cron-secret)
 *   - /api/mcp requires Authorization Bearer header (key checked in handler)
 *   - Email OAuth: only provider callback paths are public (start flows need session)
 *
 * Session cookie is JWE-sealed (see session-seal.ts).
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  unsealSession,
  type SealedSessionPayload,
} from "@/lib/session-seal";

// ============================================================================
// Public allowlists (narrow — prefer adding here over opening whole trees)
// ============================================================================

/** Public pages — no session */
const PUBLIC_PAGE_ROUTES = [
  "/careers",
  "/schedule",
  "/client-schedule",
  "/login",
  "/signup",
  "/invite",
  "/privacy",
  "/terms",
] as const;

/**
 * Public API prefixes that skip the session requirement.
 * Prefer specific paths; avoid broad trees when possible.
 */
const PUBLIC_API_PREFIXES = [
  "/api/auth", // login, logout, register, session check, invite
  "/api/public", // careers, token schedule, SMS inbound
  "/api/health",
  "/api/cron", // still requires CRON_SECRET below
  "/api/mcp", // still requires Bearer header below
] as const;

const DEBUG_MW = process.env.MIDDLEWARE_DEBUG === "true";

function mwLog(...args: unknown[]) {
  if (DEBUG_MW) console.log(...args);
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isPublicPage(pathname: string): boolean {
  if (pathname === "/") return true; // root marketing / redirect
  return PUBLIC_PAGE_ROUTES.some((route) => matchesPrefix(pathname, route));
}

/**
 * APIs that may run without a session cookie.
 * Email OAuth: only callback URLs (Google/Microsoft redirect), not "start OAuth".
 */
function isPublicApi(pathname: string): boolean {
  if (PUBLIC_API_PREFIXES.some((p) => matchesPrefix(pathname, p))) {
    return true;
  }
  // Exact pattern: /api/email/oauth/{provider}/callback
  if (/^\/api\/email\/oauth\/[^/]+\/callback\/?$/.test(pathname)) {
    return true;
  }
  return false;
}

async function getVerifiedSession(
  request: NextRequest
): Promise<SealedSessionPayload | null> {
  const raw = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return unsealSession(raw);
}

function injectSessionHeaders(
  request: NextRequest,
  session: SealedSessionPayload
): Headers {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant-id", session.tenantId || "");
  requestHeaders.set("x-tenant-scope", session.tenantScope || "");
  requestHeaders.set("x-user-id", session.userId || "");
  if (session.role) {
    requestHeaders.set("x-user-role", session.role);
  }
  return requestHeaders;
}

function unauthorizedApi(message = "Unauthorized"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

function isAllTenantSiteAdmin(session: SealedSessionPayload): boolean {
  const role = String(session.role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return (
    role === "site_admin" &&
    (!session.tenantScope || session.tenantScope === "all")
  );
}

function redirectToLogin(request: NextRequest, pathname: string): NextResponse {
  const loginUrl = new URL("/login", request.url);
  if (pathname && pathname !== "/") {
    loginUrl.searchParams.set("redirect", pathname);
  }
  return NextResponse.redirect(loginUrl);
}

/** Cron: require shared secret in middleware (handler also checks). */
function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed in production if secret missing
    if (process.env.NODE_ENV === "production") return false;
    return true; // local dev without CRON_SECRET
  }
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const header = request.headers.get("x-cron-secret") || "";
  return bearer === secret || header === secret;
}

/** MCP: require Authorization header presence (full key check in route). */
function mcpHasBearer(request: NextRequest): boolean {
  const auth = request.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") && auth.slice(7).trim().length >= 8;
}

// ============================================================================
// Main
// ============================================================================

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Static / Next internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // ── Public pages ────────────────────────────────────────────────────────
  if (isPublicPage(pathname) && !pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // ── APIs ────────────────────────────────────────────────────────────────
  if (pathname.startsWith("/api/")) {
    // Cron: secret only (no session)
    if (matchesPrefix(pathname, "/api/cron")) {
      if (!cronAuthorized(request)) {
        mwLog(`[Middleware] Cron unauthorized: ${pathname}`);
        return unauthorizedApi("Unauthorized");
      }
      return NextResponse.next();
    }

    // MCP: Bearer header required; key validated in handler
    if (matchesPrefix(pathname, "/api/mcp")) {
      if (request.method === "OPTIONS") {
        return NextResponse.next();
      }
      if (!mcpHasBearer(request)) {
        mwLog(`[Middleware] MCP missing bearer: ${pathname}`);
        return unauthorizedApi("Unauthorized");
      }
      return NextResponse.next();
    }

    // Explicit public APIs (auth, public careers, health, oauth callbacks)
    if (isPublicApi(pathname)) {
      return NextResponse.next();
    }

    // Default deny: sealed session required
    const session = await getVerifiedSession(request);
    if (!session?.userId) {
      mwLog(`[Middleware] API unauthorized: ${pathname}`);
      return unauthorizedApi();
    }
    if (
      isAllTenantSiteAdmin(session) &&
      !matchesPrefix(pathname, "/api/site-admin")
    ) {
      return NextResponse.json(
        { error: "Select a tenant before accessing operational data" },
        { status: 409 },
      );
    }
    // Optional: require tenant for data-plane APIs (not all routes need it)
    // Keep open for site_admin tooling that may resolve tenant later.

    const requestHeaders = injectSessionHeaders(request, session);
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // ── Protected pages — default deny (anything not public page) ───────────
  const session = await getVerifiedSession(request);
  if (!session?.userId) {
    mwLog(`[Middleware] Page unauthorized: ${pathname}`);
    return redirectToLogin(request, pathname);
  }

  const requestHeaders = injectSessionHeaders(request, session);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
