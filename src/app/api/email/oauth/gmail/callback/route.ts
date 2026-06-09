/**
 * Gmail OAuth Callback Endpoint
 * Handles OAuth redirect from Google
 * 
 * GET /api/email/oauth/gmail/callback
 */

import { NextRequest, NextResponse } from 'next/server';
import { exchangeGmailCode } from '@/lib/email/oauth-service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    
    // Handle error from Google
    if (error) {
      console.error('[GMAIL OAuth] Error from Google:', error);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/settings?email_error=${encodeURIComponent(error)}`
      );
    }
    
    // Validate code
    if (!code) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/settings?email_error=No authorization code`
      );
    }
    
    // Decode state to get userId
    let userId: string;
    try {
      const stateObj = JSON.parse(Buffer.from(state!, 'base64').toString());
      userId = stateObj.userId;
    } catch {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/settings?email_error=Invalid state`
      );
    }
    
    // Exchange code for tokens
    const result = await exchangeGmailCode(userId, code);
    
    if (!result.success) {
      console.error('[GMAIL OAuth] Token exchange failed:', result.error);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/settings?email_error=${encodeURIComponent(result.error || 'Connection failed')}`
      );
    }
    
    // Success - redirect to settings with success message
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/settings?email_connected=gmail`
    );
  } catch (error) {
    console.error('[GMAIL OAuth Callback] Error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/settings?email_error=Unexpected error`
    );
  }
}
