/**
 * Send Bulk Email API Route
 * Handles batch sending emails using Resend API
 * 
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import RecruiterOutreach from '@/emails/RecruiterOutreach';
import { createEmailLog, type CreateEmailLogInput } from '@/lib/db/repositories/email-log-repository';

/**
 * Get Resend client (lazy initialization)
 * This prevents build-time errors when API key is not set
 */
function getResendClient(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  return new Resend(process.env.RESEND_API_KEY);
}

export interface Contact {
  id: string;
  email: string;
  name: string;
  company: string;
}

export interface SendBulkRequest {
  contacts: Contact[];
  subject: string;
  message?: string;
  templateData?: {
    ctaUrl?: string;
  };
  tenantId: string;
  userId: string;
}

/**
 * POST /api/send-bulk
 * Send bulk emails to multiple contacts
 */
export async function POST(request: NextRequest) {
  try {
    // Check if Resend is configured
    if (!process.env.RESEND_API_KEY) {
      console.error('[SEND-BULK] RESEND_API_KEY not configured');
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 500 }
      );
    }

    if (!process.env.RESEND_FROM_EMAIL) {
      console.error('[SEND-BULK] RESEND_FROM_EMAIL not configured');
      return NextResponse.json(
        { error: 'Sender email not configured' },
        { status: 500 }
      );
    }

    const body: SendBulkRequest = await request.json();
    const { contacts, subject, message, templateData, tenantId, userId } = body;

    if (!contacts || contacts.length === 0) {
      return NextResponse.json(
        { error: 'No contacts provided' },
        { status: 400 }
      );
    }

    console.log(`[SEND-BULK] Sending ${contacts.length} emails...`);

    // Prepare emails for batch sending
    const emails = contacts.map(contact => ({
      from: process.env.RESEND_FROM_EMAIL!,
      to: contact.email,
      subject: subject,
      react: RecruiterOutreach({
        name: contact.name,
        company: contact.company,
        ctaUrl: templateData?.ctaUrl,
      }),
    }));

// Get Resend client and send batch emails
    const resend = getResendClient();
    const data = await resend.batch.send(emails);

    console.log('[SEND-BULK] Resend response:', data);

    // Get message IDs from response - Resend returns an array of results
    // Use type assertion through unknown to avoid type incompatibility
    const rawData = data.data as unknown;
    const messageIds = Array.isArray(rawData) 
      ? (rawData as Array<{ id?: string }>).map(d => d.id).filter((id): id is string => !!id)
      : [];

    // Log each email to DynamoDB
    const emailLogs: CreateEmailLogInput[] = contacts.map((contact, index) => ({
      tenantId,
      userId,
      contactId: contact.id,
      contactEmail: contact.email,
      subject,
      body: message || '',
      status: 'sent',
      resendMessageId: messageIds[index],
    }));

    // Insert logs in parallel
    await Promise.all(
      emailLogs.map(log => createEmailLog(log).catch(err => {
        console.error('[SEND-BULK] Failed to log email:', err);
      }))
    );

    return NextResponse.json({
      success: true,
      data: {
        ids: messageIds,
      },
      count: contacts.length,
    });
  } catch (error) {
    console.error('[SEND-BULK] Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to send emails';
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
