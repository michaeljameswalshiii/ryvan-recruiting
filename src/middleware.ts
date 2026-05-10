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

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/signup',
];

// API public routes (never require redirect) - auth handled in route
const API_PUBLIC_ROUTES = [
  '/api/auth',
  '/api/bedrock',
  '/api/apollo',
  '/api/tavily',
  '/api/boolean',
];

// Protected routes that require authentication
const PROTECTED_ROUTES = ['/dashboard'];

// Session cookie name
const SESSION_COOKIE = 'turnkey-session';

/**
 * Check if a route is public
 */
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  );
}

/**
 * Check if a route is API public (allows auth but no redirect)
 */
function isApiPublicRoute(pathname: string): boolean {
  return API_PUBLIC_ROUTES.some(route => pathname.startsWith(route));
}

/**
 * Check if a route is protected
 */
function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some(route => pathname.startsWith(route));
}

/**
 * Check if route needs tenant/user injection (AI routes)
 */
function needsTenantContext(pathname: string): boolean {
  return pathname.startsWith('/api/bedrock') || 
         pathname.startsWith('/api/apollo');
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
 * NOTE: Uses GetUserCommand - simple and reliable
 * Consider aws-jwt-verify for faster local validation
 */
async function validateSessionToken(accessToken: string): Promise<boolean> {
  if (!accessToken) {
    return false;
  }
  
  try {
    const { GetUserCommand, CognitoIdentityProviderClient } = await import('@aws-sdk/client-cognito-identity-provider');
    
    const region = process.env.AWS_REGION || 'us-east-1';
    const client = new CognitoIdentityProviderClient({ region });
    
    const command = new GetUserCommand({ AccessToken: accessToken });
    await client.send(command);
    
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static files and Next.js internal routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Allow public routes (including /login and /signup)
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Allow API routes through - they handle their own auth
  if (isApiPublicRoute(pathname)) {
    // But inject tenant context for AI routes that need it
    if (needsTenantContext(pathname)) {
      const session = getSession(request);
      
      if (session?.accessToken) {
        // Validate token for API access
        const isValid = await validateSessionToken(session.accessToken);
        
        if (!isValid) {
          return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          );
        }
        
        // Inject headers for downstream use
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('x-tenant-id', session.tenantId || '');
        requestHeaders.set('x-user-id', session.userId || '');
        
        return NextResponse.next({
          request: { headers: requestHeaders },
        });
      }
      
      // No session - return 401
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    return NextResponse.next();
  }

  // Check if route is protected (dashboard)
  if (isProtectedRoute(pathname)) {
    const session = getSession(request);
    
    // No session - redirect to login
    if (!session?.accessToken) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Validate the token with Cognito
    const isValid = await validateSessionToken(session.accessToken);
    
    if (!isValid) {
      // Token invalid or expired - redirect to login
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Get tenantId from session (NEVER trust client-provided)
    const tenantId = session.tenantId || '';
    const userId = session.userId || '';

    // Add tenant context headers for downstream use
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-tenant-id', tenantId);
    requestHeaders.set('x-user-id', userId);

    // Clone the response with headers
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
