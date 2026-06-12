/**
 * Email Actions
 * Server actions for email operations with tenant isolation
 * 
 * @serverOnly
 */

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessionTenantId, getSessionUserId } from '@/lib/server-auth';
import { sendEmail, sendBulkEmails } from '@/lib/email/resend-service';
import { OutreachEmail } from '@/lib/email/templates';
import { getEmailLogsByTenant, createEmailLog } from '@/lib/db/repositories/email-log-repository';

// Validation schema for sending outreach
const SendOutreachSchema = z.object({
  leadId: z.string(),
  customMessage: z.string().optional(),
});

// Validation schema for bulk emails
const SendBulkSchema = z.object({
  leadIds: z.array(z.string()).min(1),
  subject: z.string().min(1),
  customMessage: z.string().optional(),
});

export interface SendBulkContact {
  id: string;
  email: string;
  name: string;
  company: string;
}

export interface SendBulkParams {
  contacts: SendBulkContact[];
  subject: string;
  message?: string;
  templateData?: {
    ctaUrl?: string;
  };
  tenantId: string;
  userId: string;
}

interface SendBulkResult {
  success: boolean;
  error?: string;
  count?: number;
}

interface SendOutreachResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

/**
 * Send outreach email to a single lead
 */
export async function sendOutreachEmail(formData: FormData | { leadId: string; customMessage?: string }): Promise<SendOutreachResult> {
  // Get tenant context from session
  const tenantId = await getSessionTenantId();
  const userId = await getSessionUserId();

  if (!tenantId || !userId) {
    return { success: false, error: 'Authentication required' };
  }

  // Parse and validate input
  const parsed = SendOutreachSchema.parse(
    formData instanceof FormData ? Object.fromEntries(formData) : formData
  );

  // In a real app, fetch lead from repository
  // For now, we'll create a placeholder that can be extended
  const lead = {
    id: parsed.leadId,
    name: 'Lead', // Would come from lead repository
    email: 'lead@example.com', // Would come from lead repository
    company: 'Your Company',
    position: 'Open Position',
  };

  if (!lead?.email) {
    return { success: false, error: 'Lead has no email address' };
  }

  const templateProps = {
    leadName: lead.name,
    companyName: lead.company,
    position: lead.position || 'role',
    customMessage: parsed.customMessage,
    recruiterName: 'Your Name', // Would come from session/profile
  };

  const emailReact = OutreachEmail(templateProps);

  try {
    const result = await sendEmail({
      to: lead.email,
      subject: `Opportunity at ${templateProps.companyName} - ${templateProps.position}`,
      react: emailReact,
    });

    // Log the email to database
    await createEmailLog({
      tenantId,
      userId,
      contactId: lead.id,
      contactEmail: lead.email,
      subject: `Opportunity at ${templateProps.companyName}`,
      body: parsed.customMessage || '',
      status: 'sent',
      resendMessageId: result.messageId,
    });

    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('[EMAIL ACTIONS] Failed to send outreach:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to send email' };
  }
}

/**
 * Send bulk emails to multiple contacts
 */
export async function sendBulkEmailsAction(params: SendBulkParams): Promise<SendBulkResult> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/send-bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to send emails',
      };
    }

    return {
      success: true,
      count: data.count,
    };
  } catch (error) {
    console.error('[EMAIL ACTIONS] Error sending bulk emails:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get email logs for the current tenant
 */
export async function getTenantEmailLogs() {
  const tenantId = await getSessionTenantId();
  
  if (!tenantId) {
    return [];
  }
  
  return getEmailLogsByTenant(tenantId);
}

/**
 * Revalidate email logs cache
 */
export async function revalidateEmailLogs(): Promise<void> {
  const tenantId = await getSessionTenantId();
  if (tenantId) {
    revalidatePath(`/api/email-logs?tenantId=${tenantId}`);
  }
}
