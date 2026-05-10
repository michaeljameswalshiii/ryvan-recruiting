/**
 * Auth Session API Route
 * Check if user is authenticated
 * 
 * @serverOnly
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/server-auth';

/**
 * GET /api/auth/session
 * Get current session if valid
 */
export async function GET() {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      user: {
        id: session.userId,
        email: session.email,
        tenantId: session.tenantId,
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Session check failed' },
      { status: 401 }
    );
  }
}
