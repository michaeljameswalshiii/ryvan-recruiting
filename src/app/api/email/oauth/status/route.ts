/**
 * OAuth configuration status (no redirects — safe for Settings UI).
 * GET /api/email/oauth/status
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    gmail: !!(
      process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET
    ),
    outlook: !!(
      process.env.OUTLOOK_CLIENT_ID && process.env.OUTLOOK_CLIENT_SECRET
    ),
  });
}
