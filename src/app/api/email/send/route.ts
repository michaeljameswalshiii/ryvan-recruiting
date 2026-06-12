/**
 * Send Email API
 * Send email via user's connected email account
 * 
 * POST /api/email/send
 * Body: { userId, to, subject, text, html, candidateId, replyTo, threadId }
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/send-email-service';
import { sendEmailOptionsSchema } from '@/lib/schemas/email-connection';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validated = sendEmailOptionsSchema.parse(body);
    
    const { userId, to, subject, text, html, candidateId, replyTo, threadId, references, inReplyTo, candidateEmail } = validated;
    
    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }
    
    if (!to || !subject) {
      return NextResponse.json(
        { error: 'to and subject are required' },
        { status: 400 }
      );
    }
    
    // Send email
    const result = await sendEmail(userId, {
      from: '', // Will be filled by provider
      to,
      subject,
      text,
      html,
      candidateId,
      replyTo,
      threadId,
      references,
      inReplyTo,
      candidateEmail,
    });
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send email' },
        { status: 500 }
      );
    }
    
    // Log to email logs table (if needed)
    // For now, just return success
    
    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      provider: result.provider,
    });
  } catch (error) {
    console.error('[Send Email] Error:', error);
    
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid input', details: error.message },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    );
  }
}
