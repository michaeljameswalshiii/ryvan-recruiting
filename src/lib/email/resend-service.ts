/**
 * Resend Email Service
 * Server-side email sending using Resend API
 * 
 * @serverOnly
 */

'use server';

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export type EmailTemplateProps = {
  leadName: string;
  companyName?: string;
  position?: string;
  customMessage?: string;
  recruiterName?: string;
};

/**
 * Send an email using Resend
 */
export async function sendEmail({
  to,
  subject,
  react,
  from = process.env.FROM_EMAIL,
}: {
  to: string | string[];
  subject: string;
  react: React.ReactElement;
  from?: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  if (!from) {
    throw new Error('FROM_EMAIL is not configured');
  }

  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      react,
    });

    if (error) {
      console.error('[EMAIL] Resend error:', error);
      throw new Error(error.message);
    }

    console.log(`[EMAIL] Sent to ${to}`, data?.id);
    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error('[EMAIL] Failed to send:', error);
    throw error;
  }
}

/**
 * Send bulk emails using Resend batch API
 */
export async function sendBulkEmails({
  emails,
}: {
  emails: Array<{
    to: string;
    subject: string;
    react: React.ReactElement;
  }>;
}) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  const from = process.env.FROM_EMAIL;
  if (!from) {
    throw new Error('FROM_EMAIL is not configured');
  }

  try {
    const batchEmails = emails.map(email => ({
      from,
      to: email.to,
      subject: email.subject,
      react: email.react,
    }));

    const { data, error } = await resend.batch.send(batchEmails);

    if (error) {
      console.error('[EMAIL] Resend batch error:', error);
      throw new Error(error.message);
    }

    console.log(`[EMAIL] Batch sent ${emails.length} emails`);
    return { success: true, data };
  } catch (error) {
    console.error('[EMAIL] Failed to send bulk:', error);
    throw error;
  }
}
