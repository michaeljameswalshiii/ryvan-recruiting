/**
 * Candidate Email Service
 * Easy to use function for sending emails to candidates
 * 
 * @serverOnly
 */

'use server';

import { sendGmail } from './gmail-service';
import { recordEmailSent } from '../events/candidate-events';

export interface Candidate {
  email: string;
  name?: string;
}

export interface SendToCandidateOptions {
  subject: string;
  text?: string;
  html?: string;
}

export interface SendToCandidateResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send an email to a candidate
 * 
 * @param candidate - The candidate object with email and optional name
 * @param options - Email options with subject, text, and/or html
 * @param createdBy - User who sent the email (for event tracking)
 * @returns Result object with success status and messageId or error
 */
export async function sendToCandidate(
  candidate: Candidate,
  options: SendToCandidateOptions,
  createdBy: string = 'system'
): Promise<SendToCandidateResult> {
  try {
    const from = process.env.EMAIL_FROM;
    if (!from) {
      throw new Error('EMAIL_FROM is not configured');
    }

    if (!candidate.email) {
      throw new Error('Candidate email is required');
    }

const result = await sendGmail({
      to: candidate.email,
      subject: options.subject,
      text: options.text || '',
      html: options.html || (options.text ? `<p>${options.text}</p>` : undefined),
    });

    // Auto-record email sent event on success
    if (result.success && result.messageId) {
      await recordEmailSent(
        candidate.email,
        options.subject,
        candidate.email,
        createdBy,
        { messageId: result.messageId }
      );
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    };
  }
}

/**
 * Send a templated email to a candidate
 * 
 * @param candidate - The candidate object with email and optional name
 * @param template - Template name (e.g., 'interview-invite', 'rejection', 'offer')
 * @param customVars - Custom variables to replace in template
 * @param createdBy - User who sent the email (for event tracking)
 */
export async function sendTemplatedEmail(
  candidate: Candidate,
  template: string,
  customVars: Record<string, string> = {},
  createdBy: string = 'system'
): Promise<SendToCandidateResult> {
  const templates: Record<string, { subject: string; html: string }> = {
    'interview-invite': {
      subject: 'Interview Invitation - Turnkey Optimization',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Hello ${candidate.name || 'Candidate'},</h2>
          <p>Thank you for your interest in Turnkey Optimization.</p>
          <p>We would like to invite you for an interview. Please let us know your availability.</p>
          <p>Best regards,<br/>The Turnkey Team</p>
        </div>
      `,
    },
    rejection: {
      subject: 'Update on Your Application - Turnkey Optimization',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Hello ${candidate.name || 'Candidate'},</h2>
          <p>Thank you for your interest in Turnkey Optimization.</p>
          <p>After careful consideration, we have decided to move forward with other candidates.</p>
          <p>We wish you the best in your job search.</p>
          <p>Best regards,<br/>The Turnkey Team</p>
        </div>
      `,
    },
    offer: {
      subject: 'Job Offer - Turnkey Optimization',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Hello ${candidate.name || 'Candidate'},</h2>
          <p>Congratulations! We are pleased to offer you a position at Turnkey Optimization.</p>
          <p>Please review the attached offer details and let us know if you have any questions.</p>
          <p>We're excited to have you join our team!</p>
          <p>Best regards,<br/>The Turnkey Team</p>
        </div>
      `,
    },
  };

  const templateContent = templates[template];
  if (!templateContent) {
    return {
      success: false,
      error: `Template '${template}' not found`,
    };
  }

  // Replace custom variables in template
  let html = templateContent.html;
  for (const [key, value] of Object.entries(customVars)) {
    html = html.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  return await sendToCandidate(candidate, {
    subject: templateContent.subject,
    html,
  }, createdBy);
}
