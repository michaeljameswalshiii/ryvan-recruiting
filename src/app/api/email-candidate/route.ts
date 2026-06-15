/**
 * Email Candidate API Route
 * Example endpoint for sending emails to candidates
 * 
 * POST /api/email-candidate
 * Body: { email: string, name?: string, subject: string, text?: string, html?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendToCandidate } from '@/lib/email/candidate-email';

export async function POST(request: NextRequest) {
  try {
    // Validate email configuration
    if (!process.env.EMAIL_FROM) {
      return NextResponse.json(
        { success: false, error: 'Email not configured' },
        { status: 500 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { email, name, subject, text, html } = body;

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!subject) {
      return NextResponse.json(
        { success: false, error: 'Subject is required' },
        { status: 400 }
      );
    }

    // Send email to candidate
    const result = await sendToCandidate(
      { email, name },
      { subject, text, html }
    );

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Email sent to ${email}`,
        messageId: result.messageId,
      });
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// For testing - GET returns usage info
export async function GET() {
  return NextResponse.json({
    usage: 'POST /api/email-candidate with JSON body',
    example: {
      email: 'candidate@example.com',
      name: 'John Doe',
      subject: 'Interview Invitation',
      text: 'We would like to invite you...',
      html: '<p>We would like to invite you...</p>',
    },
  });
}
