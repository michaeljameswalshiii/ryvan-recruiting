/**
 * Outlook OAuth Callback Endpoint
 * Handles OAuth redirect from Microsoft
 * 
 * GET /api/email/oauth/outlook/callback
 */

import { NextRequest, NextResponse } from 'next/server';
import { exchangeOutlookCode } from '@/lib/email/oauth-service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    
    // Handle error from Microsoft
    if (error || errorDescription) {
      console.error('[OUTLOOK OAuth] Error from Microsoft:', error || errorDescription);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/settings?email_error=${encodeURIComponent(errorDescription || error)}`
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
    const result = await exchangeOutlookCode(userId, code);
    
    if (!result.success) {
      console.error('[OUTLOOK OAuth] Token exchange failed:', result.error);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/settings?email_error=${encodeURIComponent(result.error || 'Connection failed')}`
      );
    }
    
    // Success
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/settings?email_connected=outlook`
    );
  } catch (error) {
    console.error('[OUTLOOK OAuth Callback] Error:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/settings?email_error=Unexpected error`
    );
  }
}
