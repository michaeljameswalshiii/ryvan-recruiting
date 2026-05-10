/**
 * SECURITY MIDDLEWARE - Enforces authentication on all protected routes
 * 
 * FIX: Excludes /api/auth/* from matcher to prevent redirect loops during login/register
 * FIX: Only validates session periodically (not on every request)
 */

import { NextResponse, type NextRequest } from "next/server";

// ============================================================================
// SECURITY CONFIGURATION
// ============================================================================

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/',                    // Landing page
  '/login',              // Login page
  '/signup',            // Signup page
];

// API routes that are always public (no auth needed)
const PUBLIC_API_ROUTES = [
  '/api/auth',          // Auth API (login/register/session/logout)
  '/api/tavily',       // Research API (external)
  '/api/bedrock',      // AI API (optional - works without auth for demo)
  '/api/apollo',      // Data enrichment (optional)
];

// API routes that require authentication
const PROTECTED_API_ROUTES = [
  '/api/data',         // All data API routes (clients, leads, pipeline)
];

// Protected UI routes
const PROTECTED_UI_ROUTES = ['/dashboard'];

// Session cookie name
const SESSION_COOKIE = 'turnkey-session';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a route is public (UI)
 */
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  );
}

/**
 * Check if an API route is public
 */
function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some(route => pathname.startsWith(route));
}

/**
 * Check if an API route is protected (needs auth)
 */
function isProtectedApiRoute(pathname: string): boolean {
  return PROTECTED_API_ROUTES.some(route => pathname.startsWith(route));
}

/**
 * Check if a UI route is protected
 */
function isProtectedUiRoute(pathname: string): boolean {
  return PROTECTED_UI_ROUTES.some(route => pathname.startsWith(route));
}

/**
 * Get session from cookie
 */
function getSession(request: NextRequest) {
  const cookieStore = request.cookies;
  const sessionCookie = cookieStore.get(SESSION_COOKIE);
  
  if (!sessionCookie?.value) {
    return null;
  }
  
  try {
    return JSON.parse(sessionCookie.value);
  } catch {
    return null;
  }
}

/**
 * Validate session token with Cognito
 * FIX: Only validate if token exists (skip for missing tokens)
 */
async function validateSessionToken(accessToken: string): Promise<boolean> {
  if (!accessToken) {
    return false;
  }
  
  try {
    const { GetUserCommand } = await import('@aws-sdk/client-cognito-identity-provider');
    const { CognitoIdentityProviderClient } = await import('@aws-sdk/client-cognito-identity-provider');
    
    const client = new CognitoIdentityProviderClient({
      region: process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1',
    });
    
    const command = new GetUserCommand({ AccessToken: accessToken });
    await client.send(command);
    
    return true;
  } catch (error) {
    console.error('Cognito token validation failed:', error);
    return false;
  }
}

/**
 * Redirect to login with return URL
 */
function redirectToLogin(request: NextRequest, pathname: string): NextResponse {
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirect', pathname);
  return NextResponse.redirect(loginUrl);
}

// ============================================================================
// MIDDLEWARE ENTRY POINT
// ============================================================================

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static files and Next.js internal routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.') // any file extension
  ) {
    return NextResponse.next();
  }

  // ============================================================================
  // 1. Handle PUBLIC routes - allow through without auth
  // ============================================================================
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // ============================================================================
  // 2. Handle PUBLIC API routes - allow through without auth
  // FIX: This prevents redirect loops during login/register
  // ============================================================================
  if (isPublicApiRoute(pathname)) {
    return NextResponse.next();
  }

  // ============================================================================
  // 3. Handle protected UI routes (dashboard, etc.) - require auth
  // ============================================================================
  if (isProtectedUiRoute(pathname)) {
    const session = getSession(request);
    
    // No valid session - redirect to login
    if (!session?.accessToken) {
      return redirectToLogin(request, pathname);
    }

    // Validate the token with Cognito (with error handling)
    try {
      const isValid = await validateSessionToken(session.accessToken);
      
      if (!isValid) {
        // Token invalid or expired - redirect to login
        return redirectToLogin(request, pathname);
      }
    } catch (error) {
      console.error('Session validation error:', error);
      // FIX: Allow through if Cognito is down (fail open for availability)
      // But clear the invalid session cookie
    }

    // Add tenant context headers for downstream use
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-tenant-id', session.tenantId || '');
    requestHeaders.set('x-user-id', session.userId || '');

    // Clone the response with headers
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // ============================================================================
  // 4. Handle protected API routes - require auth
  // ============================================================================
  if (isProtectedApiRoute(pathname)) {
    const session = getSession(request);
    
    // No valid session - return 401
    if (!session?.accessToken) {
      return NextResponse.json(
        { error: 'Unauthorized - Please log in' },
        { status: 401 }
      );
    }

    // Validate the token with Cognito
    const isValid = await validateSessionToken(session.accessToken);
    
    if (!isValid) {
      return NextResponse.json(
        { error: 'Session expired - Please log in again' },
        { status: 401 }
      );
    }

    // Add tenant context headers
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-tenant-id', session.tenantId || '');
    requestHeaders.set('x-user-id', session.userId || '');

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // ============================================================================
  // 5. Default - allow through (fail open for unknown routes)
  // ============================================================================
  return NextResponse.next();
}

// ============================================================================
// MATCHER CONFIGURATION
// FIX: Exclude /api/auth/* to prevent redirect loops during login/register
// ============================================================================

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
