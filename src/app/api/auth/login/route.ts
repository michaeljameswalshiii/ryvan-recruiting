/**
 * Auth Login API Route
 * Server-side login using httpOnly cookies
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, setSessionCookie } from '@/lib/server-auth';
import { loginSchema } from '@/lib/schemas/auth';

/**
 * POST /api/auth/login
 * Login and set session cookie
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input with Zod
    const validated = loginSchema.safeParse(body);
    
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 400 }
      );
    }

    const { email, password } = validated.data;

// Authenticate with Cognito
    console.log('[LOGIN] Authenticating user:', email);
    const session = await authenticateUser(email, password);
    console.log('[LOGIN] Authentication successful, userId:', session.userId);

// Create session data for cookie - store BOTH accessToken and refresh token
    // accessToken needed for middleware validation
    // refreshToken needed for token refresh when accessToken expires
    const sessionData = {
      userId: session.userId,
      email: session.email,
      tenantId: session.tenantId,
      accessToken: session.AccessToken,
      refreshToken: session.RefreshToken,
    };

    // Use helper to set cookie - returns response directly
    return setSessionCookie(
      NextResponse.json({ 
        success: true,
        user: {
          id: session.userId,
          email: session.email,
          tenantId: session.tenantId,
        }
      }),
      sessionData
    );
  } catch (error: unknown) {
    console.error('[LOGIN] Full error:', error);
    
    // Check if it's an authentication configuration error
    const errorMessage = error instanceof Error ? error.message : 'Login failed';
    
    if (errorMessage.includes('not configured') || errorMessage.includes('undefined')) {
      console.error('[LOGIN] Env vars check:');
      console.error('[LOGIN]   COGNITO_CLIENT_ID:', process.env.COGNITO_CLIENT_ID ? 'set' : 'MISSING');
      console.error('[LOGIN]   COGNITO_USER_POOL_ID:', process.env.COGNITO_USER_POOL_ID ? 'set' : 'MISSING');
      console.error('[LOGIN]   AWS_REGION:', process.env.AWS_REGION ? 'set' : 'MISSING');
    }
    
    // Don't leak internal error messages
    const message = error instanceof Error ? error.message : 'Login failed';
    
    return NextResponse.json(
      { error: message },
      { status: 401 }
    );
  }
}
