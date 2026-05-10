/**
 * Auth Logout API Route
 * Clears session cookie and signs out from Cognito
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, signOutFromCognito } from '@/lib/server-auth';

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
        console.log('Cognito sign out error:', err);
      }
    }
    
    // Clear session cookie
    const response = NextResponse.json({ success: true });
    response.cookies.delete('turnkey-session');
    
    return response;
  } catch (error: any) {
    console.error('Logout error:', error);
    // Still return success - session should be cleared
    const response = NextResponse.json({ success: true });
    response.cookies.delete('turnkey-session');
    return response;
  }
}
