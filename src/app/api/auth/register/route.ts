/**
 * Auth Register API Route
 * Server-side registration using httpOnly cookies
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { registerUser } from '@/lib/server-auth';
import { registerSchema } from '@/lib/schemas/auth';

/**
 * POST /api/auth/register
 * Register new user (requires email confirmation before login)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validated = registerSchema.safeParse(body);
    
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Register user (requires email confirmation in Cognito)
    const result = await registerUser(
      validated.data.email,
      validated.data.password,
      validated.data.fullName,
      validated.data.tenantName,
      validated.data.subdomain
    );

    return NextResponse.json({ 
      success: true,
      message: 'Registration successful. Please check your email to confirm your account before logging in.',
      user: {
        id: result.userId,
        tenantId: result.tenantId,
      }
    });
  } catch (error: any) {
    console.error('Register error:', error);
    return NextResponse.json(
      { error: error.message || 'Registration failed' },
      { status: 400 }
    );
  }
}
