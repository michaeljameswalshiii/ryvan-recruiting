/**
 * Auth Logout API Route
 * Clears session cookie and signs out from Cognito
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, signOutFromCognito, clearSessionCookie } from '@/lib/server-auth';

/**
 * POST /api/auth/logout
 * Clear session cookie and sign out
 */
export async function POST(request: NextRequest) {
  try {
    // Get session to get token for Cognito sign out
    const session = await getSession();
    
    // Sign out from Cognito if we have a token
    if (session?.accessToken) {
      try {
        await signOutFromCognito(session.accessToken);
      } catch (err) {
        // Log but don't fail - token may already be invalid
        console.log('Cognito sign out error:', err);
      }
    }
    
    // Use helper to clear cookie - returns response directly
    return clearSessionCookie(NextResponse.json({ success: true }));
  } catch (error: unknown) {
    console.error('Logout error:', error);
    
    // Still return success - session should be cleared
    return clearSessionCookie(NextResponse.json({ success: true }));
  }
}
