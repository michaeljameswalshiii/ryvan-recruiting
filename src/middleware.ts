/**
 * Security Middleware
 *
 * Model: protect the ATS (dashboard / admin / internal candidates), leave
 * public surfaces open — especially multi-tenant careers pages applicants use
 * without an account.
 *
 * Public exceptions (no login):
 *   - Pages:  /careers/*, /login, /signup, /invite/*, /privacy, /terms
 *   - APIs:   /api/public/* (careers jobs + apply), /api/auth/*
 *
 * Protected (session required):
 *   - /dashboard/*, /candidates/*, /admin/*, /api/admin/*
 *
 * Performance:
 *   - Page navigations only check session cookie presence (no Cognito round-trip).
 *     Cognito GetUser on every menu click was multi-hundred-ms to multi-second lag.
 *   - Token network validation is reserved for selected sensitive APIs if needed
 *     by route handlers; cookie userId is enough to enter the shell.
 *
 * Injects x-tenant-id and x-user-id for selected authenticated APIs.
 *
 * @serverOnly
 */

import { NextResponse, type NextRequest } from "next/server";

// ============================================================================
// Route classification
// ============================================================================

/**
 * Public **pages** — applicants and unauthenticated browsers.
 * Careers is the intentional exception to "must log in to use the site".
 */
const PUBLIC_PAGE_ROUTES = [
  "/careers", // /careers, /careers/{slug}, /careers/{slug}/{jobId}
  "/schedule", // candidate self-schedule (token)
  "/client-schedule", // client interviewer portal (token)
  "/login",
  "/signup",
  "/invite", // invite accept flow
  "/privacy", // Google OAuth / public legal
  "/terms",
];

/**
 * Public **APIs** — no session cookie required.
 * Careers feed + apply live under /api/public/careers/*
 */
const PUBLIC_API_ROUTES = [
  "/api/auth",
  "/api/public", // careers jobs, apply, logo — multi-tenant public surface
  "/api/mcp", // Claude MCP HTTP tools — API key auth (not session cookie)
  "/api/apollo",
  "/api/tavily",
  "/api/boolean",
  "/api/health",
];

// API routes that need session injection (for client-side calls from dashboard)
// bedrock + ai + apollo: inject x-user-id / x-tenant-id when logged in for usage logging
const PROTECTED_API_ROUTES = [
  "/api/jobs",
  "/api/data/jobs",
  "/api/data/clients",
  "/api/candidates",
  "/api/ai",
  "/api/bedrock",
  "/api/apollo",
];

// Protected routes that require authentication
const PROTECTED_ROUTES = ["/dashboard", "/candidates", "/admin", "/api/admin"];

// Session cookie name
const SESSION_COOKIE = "turnkey-session";

const DEBUG_MW = process.env.MIDDLEWARE_DEBUG === "true";

function mwLog(...args: unknown[]) {
  if (DEBUG_MW) console.log(...args);
}

/**
 * Check if route is public (no auth required)
 */
function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route))) {
    return true;
  }
  if (
    PUBLIC_PAGE_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`)
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Check if route is protected (requires auth)
 */
function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
}

/**
 * Get session from cookie (local parse only — no network)
 */
function getSession(request: NextRequest) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE);

  if (!sessionCookie?.value) {
    return null;
  }

  try {
    return JSON.parse(sessionCookie.value) as {
      userId?: string;
      email?: string;
      tenantId?: string;
      role?: string;
      accessToken?: string;
      refreshToken?: string;
    };
  } catch {
    return null;
  }
}

/**
 * Cheap local JWT expiry check (no signature verify, no Cognito).
 * Used only as a soft signal for API routes — pages just need userId.
 */
function isJwtExpired(accessToken: string, skewSeconds = 30): boolean {
  try {
    const parts = accessToken.split(".");
    if (parts.length < 2) return false;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    // atob is available in Edge runtime
    const json = atob(b64);
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp !== "number") return false;
    return Date.now() >= payload.exp * 1000 - skewSeconds * 1000;
  } catch {
    return false;
  }
}

// ============================================================================
// Main Middleware
// ============================================================================

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip static files and Next.js internal routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // === PUBLIC ROUTES - Immediate bypass ===
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // === PROTECTED API ROUTES - Inject session headers ===
  const isProtectedApiRoute = PROTECTED_API_ROUTES.some((route) =>
    pathname.startsWith(route)
  );
  if (isProtectedApiRoute) {
    const session = getSession(request);

    if (!session?.userId) {
      // Allow through without headers — API route handlers re-check auth
      return NextResponse.next();
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-tenant-id", session.tenantId || "");
    requestHeaders.set("x-user-id", session.userId || "");

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // === PROTECTED ROUTES (Dashboard / admin) - Require auth ===
  if (isProtectedRoute(pathname)) {
    const session = getSession(request);
    const isApiRoute = pathname.startsWith("/api/");

    // No session at all
    if (!session?.userId) {
      mwLog(`[Middleware] No session for ${pathname}`);
      if (isApiRoute) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Pages: cookie presence is enough. Skipping Cognito GetUser here is the
    // main nav speed fix (was a network hop on every sidebar click).
    // APIs under /api/admin still get a local JWT exp soft-check when token present.
    if (isApiRoute && session.accessToken && session.accessToken.length > 0) {
      if (isJwtExpired(session.accessToken)) {
        mwLog(`[Middleware] Access token expired for ${pathname}`);
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Inject headers for downstream server components / APIs
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-tenant-id", session.tenantId || "");
    requestHeaders.set("x-user-id", session.userId || "");

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // Default: allow through
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
