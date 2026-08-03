/**
 * Security Middleware
 *
 * - Sealed session cookie (JWE) verified before protected access
 * - API default-deny: all /api/* require a valid session except public allowlist
 * - Public: careers, auth, schedule tokens, health, MCP (API key)
 *
 * @serverOnly
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  unsealSession,
  type SealedSessionPayload,
} from "@/lib/session-seal";

// ============================================================================
// Route classification
// ============================================================================

/**
 * Public pages — applicants and unauthenticated browsers.
 */
const PUBLIC_PAGE_ROUTES = [
  "/careers",
  "/schedule",
  "/client-schedule",
  "/login",
  "/signup",
  "/invite",
  "/privacy",
  "/terms",
];

/**
 * Public APIs — no session cookie required.
 * (Handlers may still enforce API keys / tokens.)
 */
const PUBLIC_API_ROUTES = [
  "/api/auth", // login, logout, signup, invite accept
  "/api/public", // careers, schedule tokens, SMS inbound webhooks
  "/api/mcp", // Claude MCP — API key auth
  "/api/health",
  "/api/cron", // Vercel cron — Bearer CRON_SECRET (handler-enforced)
  "/api/email/oauth", // Gmail/Outlook OAuth redirects (state-bound)
];

/**
 * Page shells that require a valid sealed session.
 */
const PROTECTED_PAGE_ROUTES = [
  "/dashboard",
  "/candidates",
  "/admin",
  "/email",
];

const DEBUG_MW = process.env.MIDDLEWARE_DEBUG === "true";

function mwLog(...args: unknown[]) {
  if (DEBUG_MW) console.log(...args);
}

function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route));
}

function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PAGE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

/**
 * Verify sealed session from cookie. Rejects legacy JSON and invalid seals.
 */
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
  requestHeaders.set("x-user-id", session.userId || "");
  if (session.role) {
    requestHeaders.set("x-user-role", session.role);
  }
  return requestHeaders;
}

function unauthorizedApi(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function redirectToLogin(request: NextRequest, pathname: string): NextResponse {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
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

  // === PUBLIC PAGES ===
  if (isPublicPage(pathname)) {
    return NextResponse.next();
  }

  // === PUBLIC APIs (explicit allowlist) ===
  if (pathname.startsWith("/api/") && isPublicApi(pathname)) {
    return NextResponse.next();
  }

  // === ALL OTHER APIs — default deny without sealed session ===
  if (pathname.startsWith("/api/")) {
    const session = await getVerifiedSession(request);
    if (!session?.userId) {
      mwLog(`[Middleware] API unauthorized: ${pathname}`);
      return unauthorizedApi();
    }
    const requestHeaders = injectSessionHeaders(request, session);
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // === PROTECTED PAGES (dashboard shell) ===
  if (isProtectedPage(pathname)) {
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

  // Other non-API pages: allow through (rare)
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
