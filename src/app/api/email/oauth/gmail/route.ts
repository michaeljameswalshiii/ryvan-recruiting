/**
 * Gmail OAuth Start Endpoint
 * Initiates Gmail OAuth flow
 * 
 * GET /api/email/oauth/gmail
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGmailOAuthUrl } from '@/lib/email/oauth-service';

export async function GET(request: NextRequest) {
  try {
    // Get user ID from session (server auth)
    // For now, use a query param for testing - in production, get from session
    const userId = request.nextUrl.searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }
    
    // Generate state with userId for security
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64');
    
    // Generate OAuth URL
    const oauthUrl = getGmailOAuthUrl(state);
    
    return NextResponse.redirect(oauthUrl);
  } catch (error) {
    console.error('[GMAIL OAuth] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate OAuth URL' },
      { status: 500 }
    );
  }
}
