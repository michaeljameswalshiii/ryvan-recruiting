/**
 * Outlook OAuth Start Endpoint
 * Initiates Microsoft OAuth flow
 * 
 * GET /api/email/oauth/outlook
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOutlookOAuthUrl } from '@/lib/email/oauth-service';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }
    
    // Check if Outlook OAuth is configured before attempting
    if (!process.env.OUTLOOK_CLIENT_ID || !process.env.OUTLOOK_CLIENT_SECRET) {
      return NextResponse.json(
        { error: 'Outlook OAuth is not configured. Please set OUTLOOK_CLIENT_ID and OUTLOOK_CLIENT_SECRET environment variables.' },
        { status: 503 }
      );
    }
    
    // Generate state with userId for security
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64');
    
    // Generate OAuth URL
    const oauthUrl = getOutlookOAuthUrl(state);
    
    return NextResponse.redirect(oauthUrl);
  } catch (error) {
    console.error('[OUTLOOK OAuth] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate OAuth URL' },
      { status: 500 }
    );
  }
}
