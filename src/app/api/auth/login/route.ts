/**
 * Auth Login API Route
 * Server-side login using httpOnly cookies
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/server-auth';
import { loginSchema } from '@/lib/schemas/auth';

/**
 * POST /api/auth/login
 * Login and set session cookie
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validated = loginSchema.safeParse(body);
    
    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.flatten().fieldErrors.email?.[0] || 
                validated.error.flatten().fieldErrors.password?.[0] || 
                'Invalid credentials' },
        { status: 400 }
      );
    }

    // Authenticate and get tokens
    const session = await authenticateUser(
      validated.data.email,
      validated.data.password
    );

    // Create session data
    const sessionData = {
      accessToken: session.AccessToken,
      idToken: session.IdToken,
      refreshToken: session.RefreshToken,
      userId: session.userId,
      email: session.email,
      tenantId: session.tenantId,
    };

    // Create response with cookie
    const response = NextResponse.json({ 
      success: true,
      user: {
        id: session.userId,
        email: session.email,
        tenantId: session.tenantId,
      }
    });

    // Set httpOnly session cookie
    response.cookies.set('turnkey-session', JSON.stringify(sessionData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: error.message || 'Login failed' },
      { status: 401 }
    );
  }
}
