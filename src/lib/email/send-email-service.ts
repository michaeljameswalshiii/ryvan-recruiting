/**
 * Send Email Service
 * Send emails via user's connected Gmail or Outlook account
 * 
 * @serverOnly
 */

import { google } from 'googleapis';
import { Client } from '@microsoft/microsoft-graph-client';
import { getEmailConnection, updateEmailConnection } from '../db/repositories/email-connection-repository';
import { getGmailClient, getOutlookClient, refreshGmailToken, refreshOutlookToken } from './oauth-service';
import { type SendEmailOptions } from '../schemas/email-connection';

/**
 * Build raw email message for Gmail
 */
function buildGmailRawMessage(options: {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  references?: string;
  inReplyTo?: string;
}): string {
  const lines: string[] = [];
  
  // Headers
  lines.push(`From: ${options.from}`);
  lines.push(`To: ${options.to}`);
  lines.push(`Subject: ${options.subject}`);
  
  if (options.replyTo) {
    lines.push(`Reply-To: ${options.replyTo}`);
  }
  if (options.references) {
    lines.push(`References: ${options.references}`);
  }
  if (options.inReplyTo) {
    lines.push(`In-Reply-To: ${options.inReplyTo}`);
  }
  
  // Content
  lines.push('Content-Type: text/html; charset=UTF-8');
  lines.push('');
  lines.push(options.html || options.text || '');
  
  // Encode to base64url
  const message = lines.join('\r\n');
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Send email via Gmail
 */
export async function sendGmailEmail(
  userId: string,
  options: SendEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const gmailClient = await getGmailClient(userId);
    
    if (!gmailClient) {
      return { success: false, error: 'Gmail not connected' };
    }
    
    const { oauth2Client, emailAddress } = gmailClient;
    
    // Get fresh tokens if needed
    if (oauth2Client.credentials.expiry_date && 
        oauth2Client.credentials.expiry_date < Date.now()) {
      await refreshGmailToken(userId);
    }
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Build raw message
    const raw = buildGmailRawMessage({
      from: emailAddress,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      replyTo: options.replyTo,
      references: options.references,
      inReplyTo: options.inReplyTo,
    });
    
    // Send
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw,
      },
    });
    
    const messageId = response.data.id;
    
    console.log(`[EMAIL] Gmail email sent: ${messageId}`);
    
    return { success: true, messageId };
  } catch (error) {
    console.error('[EMAIL] Gmail send failed:', error);
    
    // Mark as error if token is invalid
    if (error instanceof Error && error.message.includes('invalid_credentials')) {
      await updateEmailConnection(userId, 'gmail', {
        status: 'error',
        errorMessage: 'Invalid credentials',
      });
    }
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Send failed' 
    };
  }
}

/**
 * Send email via Outlook (Microsoft Graph)
 */
export async function sendOutlookEmail(
  userId: string,
  options: SendEmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const outlookClient = await getOutlookClient(userId);
    
    if (!outlookClient) {
      return { success: false, error: 'Outlook not connected' };
    }
    
    const { graphClient, emailAddress } = outlookClient;
    
    // Build email message
    const message = {
      subject: options.subject,
      body: {
        contentType: 'HTML',
        content: options.html || options.text || '',
      },
      toRecipients: [
        {
          emailAddress: {
            address: options.to,
          },
        },
      ],
      from: {
        emailAddress: {
          address: emailAddress,
        },
      },
    };
    
    // Add reply-to if specified
    if (options.replyTo) {
      (message as any).replyTo = [
        {
          emailAddress: {
            address: options.replyTo,
          },
        },
      ];
    }
    
    // Add threading headers via extensions
    if (options.threadId || options.references || options.inReplyTo) {
      (message as any).singleValueExtendedProperties = [
        {
          id: 'String {00020820-0000-0000-C000-000000000046} Name ThreadTopic',
          value: options.threadId || '',
        },
      ];
    }
    
    // Send
    const response = await graphClient.api(`/me/sendMail`).post({
      message,
      saveToSentItems: true,
    });
    
    // Graph doesn't return message ID for sent items, use timestamp as identifier
    const messageId = `outlook_${Date.now()}`;
    
    console.log(`[EMAIL] Outlook email sent: ${messageId}`);
    
    return { success: true, messageId };
  } catch (error) {
    console.error('[EMAIL] Outlook send failed:', error);
    
    if (error instanceof Error && error.message.includes('invalid_grant')) {
      await updateEmailConnection(userId, 'outlook', {
        status: 'revoked',
        errorMessage: 'Token revoked',
      });
    }
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Send failed' 
    };
  }
}

/**
 * Send email - chooses provider automatically
 * Priority: Gmail > Outlook
 */
export async function sendEmail(
  userId: string,
  options: SendEmailOptions,
  preferredProvider?: 'gmail' | 'outlook'
): Promise<{ success: boolean; messageId?: string; provider?: string; error?: string }> {
  // Try preferred provider first
  if (preferredProvider === 'gmail') {
    const result = await sendGmailEmail(userId, options);
    return { ...result, provider: 'gmail' };
  }
  
  if (preferredProvider === 'outlook') {
    const result = await sendOutlookEmail(userId, options);
    return { ...result, provider: 'outlook' };
  }
  
  // Try Gmail first (most common)
  const gmailResult = await sendGmailEmail(userId, options);
  if (gmailResult.success) {
    return { ...gmailResult, provider: 'gmail' };
  }
  
  // Fall back to Outlook
  const outlookResult = await sendOutlookEmail(userId, options);
  if (outlookResult.success) {
    return { ...outlookResult, provider: 'outlook' };
  }
  
  // Both failed
  return {
    success: false,
    error: `Gmail: ${gmailResult.error}, Outlook: ${outlookResult.error}`,
  };
}

/**
 * Test email connection - sends a test email
 */
export async function testEmailConnection(
  userId: string,
  provider: 'gmail' | 'outlook',
  testEmail: string
): Promise<{ success: boolean; error?: string }> {
  const result = provider === 'gmail'
    ? await sendGmailEmail(userId, {
        from: '', // Will be filled by service
        to: testEmail,
        subject: 'Test Email - Trio Recruiting',
        text: 'This is a test email from your ATS. If you received this, your email connection is working!',
      })
    : await sendOutlookEmail(userId, {
        from: '',
        to: testEmail,
        subject: 'Test Email - Trio Recruiting',
        text: 'This is a test email from your ATS. If you received this, your email connection is working!',
      });
  
  return { success: result.success, error: result.error };
}
