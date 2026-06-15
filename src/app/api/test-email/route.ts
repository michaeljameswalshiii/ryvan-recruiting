/**
 * Test Email API Route
 * Send a test email to verify Gmail SMTP configuration
 * 
 * GET /api/test-email?to=email@example.com
 * POST /api/test-email
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendGmail, testGmailConnection } from '@/lib/email/gmail-service';

/**
 * GET /api/test-email
 * Test the SMTP connection
 */
export async function GET() {
  try {
    const result = await testGmailConnection();
    
    if (result.success) {
      return NextResponse.json({ 
        success: true, 
        message: 'SMTP connection successful' 
      });
    } else {
      return NextResponse.json({ 
        success: false, 
        error: result.error 
      }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

/**
 * POST /api/test-email
 * Send a test email
 */
export async function POST(request: NextRequest) {
  try {
    // Check if Gmail is configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return NextResponse.json({ 
        success: false, 
        error: 'Gmail SMTP not configured. Add EMAIL_USER and EMAIL_PASS to .env' 
      }, { status: 500 });
    }

    // Get email from body or use default
    let toEmail = process.env.EMAIL_USER;
    
    try {
      const body = await request.json();
      if (body.to) {
        toEmail = body.to;
      }
    } catch {
      // No body, use default
    }

    // Send test email
    const result = await sendGmail({
      to: toEmail,
      subject: 'Test Email from Turnkey Optimization',
      text: 'This is a test email from Turnkey Optimization. If you received this, your Gmail SMTP is working!',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Test Email</h1>
          <p>This is a test email from <strong>Turnkey Optimization</strong>.</p>
          <p>If you received this, your Gmail SMTP is working!</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #666; font-size: 12px;">Sent via Gmail SMTP</p>
        </div>
      `,
    });

    if (result.success) {
      return NextResponse.json({ 
        success: true, 
        message: `Test email sent to ${toEmail}`,
        messageId: result.messageId 
      });
    } else {
      return NextResponse.json({ 
        success: false, 
        error: result.error 
      }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
