/**
 * Security Middleware
 * 
 * Protects all /dashboard routes.
 * Explicitly allows /api/auth/* to prevent redirect loops.
 * Injects x-tenant-id and x-user-id headers for AI APIs.
 * 
 * @serverOnly
 */

import { NextResponse, type NextRequest } from "next/server";

// ============================================================================
// TEMPORARY DEBUG MODE FOR BEDROCK TESTING
// ============================================================================

// All public routes - bypass auth immediately
const PUBLIC_API_ROUTES = [
  '/api/auth',
  '/api/apollo',
  '/api/tavily',
  '/api/bedrock',        // ← TEMP: Full access for testing
  '/api/boolean',
  '/api/health',
];

// API routes that need session injection (for client-side calls from dashboard)
const PROTECTED_API_ROUTES = [
  '/api/jobs',
  '/api/data/jobs',
  '/api/data/clients',
  '/api/candidates',
];

// Protected routes that require authentication
const PROTECTED_ROUTES = ['/dashboard', '/candidates'];

// Session cookie name
const SESSION_COOKIE = 'turnkey-session';

/**
 * Check if route is public (no auth required)
 */
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some(route => pathname.startsWith(route));
}

/**
 * Check if route is protected (requires auth)
 */
function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some(route => pathname.startsWith(route));
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
 */
async function validateSessionToken(accessToken: string, refreshToken?: string): Promise<boolean> {
  if (!accessToken) {
    console.error("[VALIDATE] No access token");
    return false;
  }
  
  const region = process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1';
  const clientId = process.env.COGNITO_CLIENT_ID || process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '';
  
  console.log("[VALIDATE] Validating token...");
  console.log("[VALIDATE] AWS_REGION:", region);
  console.log("[VALIDATE] COGNITO_CLIENT_ID:", clientId ? "set" : "NOT SET");
  
  try {
    const { GetUserCommand, CognitoIdentityProviderClient } = await import('@aws-sdk/client-cognito-identity-provider');
    
    const client = new CognitoIdentityProviderClient({ region });
    const command = new GetUserCommand({ AccessToken: accessToken });
    await client.send(command);
    
    return true;
  } catch (error: any) {
    console.error("[VALIDATE] Token validation FAILED:");
    console.error("[VALIDATE] Error:", error?.message);
    console.error("[VALIDATE] Code:", error?.code);
    
    // Try token refresh if expired
    const errorMessage = error?.message || '';
    const isExpired = errorMessage.includes('Token expired') || 
                     errorMessage.includes('NotAuthorizedException');
    
    if (isExpired && refreshToken && clientId) {
      try {
        const { InitiateAuthCommand, CognitoIdentityProviderClient } = await import('@aws-sdk/client-cognito-identity-provider');
        
        const client = new CognitoIdentityProviderClient({ region });
        const refreshCommand = new InitiateAuthCommand({
          AuthFlow: 'REFRESH_TOKEN_AUTH',
          ClientId: clientId,
          AuthParameters: { REFRESH_TOKEN: refreshToken },
        });
        
        const response = await client.send(refreshCommand);
        if (response.AuthenticationResult?.AccessToken) {
          return true;
        }
      } catch {
        return false;
      }
    }
    
    return false;
  }
}

// ============================================================================
// Main Middleware
// ============================================================================

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // === DEBUG LOGGING ===
  console.log(`[Middleware Debug] Path: ${pathname} | Has Cookie: ${!!request.cookies.get('turnkey-session')}`);

  // Skip static files and Next.js internal routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

// === PUBLIC ROUTES - Immediate bypass ===
  if (isPublicRoute(pathname)) {
    console.log(`[Middleware] Allowing public route: ${pathname}`);
    return NextResponse.next();
  }

  // === PROTECTED API ROUTES - Inject session headers ===
  const isProtectedApiRoute = PROTECTED_API_ROUTES.some(route => pathname.startsWith(route));
  if (isProtectedApiRoute) {
    console.log(`[Middleware] Processing API route: ${pathname}`);
    
    const session = getSession(request);
    
    if (!session) {
      console.log(`[Middleware] No session for API route - allowing with warning`);
      // Allow through but without headers - API will handle auth
      return NextResponse.next();
    }
    
    // Inject headers for API routes
    console.log(`[Middleware] Injecting session headers for ${pathname}:`, session.tenantId);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-tenant-id', session.tenantId || '');
    requestHeaders.set('x-user-id', session.userId || '');

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // === PROTECTED ROUTES (Dashboard) - Require auth ===
  if (isProtectedRoute(pathname)) {
    const session = getSession(request);
    
    // No session - redirect to login
    if (!session?.accessToken) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Validate token
    const isValid = await validateSessionToken(session.accessToken, session.refreshToken);
    
    if (!isValid) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Inject headers
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-tenant-id', session.tenantId || '');
    requestHeaders.set('x-user-id', session.userId || '');

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // Default: allow through
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
