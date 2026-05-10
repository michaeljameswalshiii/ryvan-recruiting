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
    const session = await authenticateUser(email, password);

    // Create session data for cookie
    const sessionData = {
      accessToken: session.AccessToken,
      idToken: session.IdToken,
      refreshToken: session.RefreshToken,
      userId: session.userId,
      email: session.email,
      tenantId: session.tenantId,
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
    console.error('Login error:', error);
    
    // Don't leak internal error messages
    const message = error instanceof Error ? error.message : 'Login failed';
    
    return NextResponse.json(
      { error: message },
      { status: 401 }
    );
  }
}
