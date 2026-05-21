/**
 * Gmail SMTP Email Service
 * Uses nodemailer with Gmail SMTP for sending emails
 * 
 * @serverOnly
 */

'use server';

import nodemailer from 'nodemailer';

// Create transporter lazily
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const host = process.env.EMAIL_SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.EMAIL_SMTP_PORT || '587');
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (!user || !pass) {
      throw new Error('EMAIL_USER and EMAIL_PASS are required');
    }

    transporter = nodemailer.createTransport({
      host,
      port,
      secure: false, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: true,
      },
    } as nodemailer.TransportOptions);
  }
  return transporter;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send an email using Gmail SMTP
 */
export async function sendGmail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const transporter = getTransporter();
    
    const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    
    if (!from) {
      throw new Error('EMAIL_FROM or EMAIL_USER is required');
    }

    const toAddresses = Array.isArray(options.to) ? options.to.join(', ') : options.to;

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM_NAME 
        ? `"${process.env.EMAIL_FROM_NAME}" <${from}>`
        : from,
      to: toAddresses,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    console.log('[GMAIL] Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[GMAIL] Failed to send:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to send email' 
    };
  }
}

/**
 * Test Gmail SMTP configuration
 */
export async function testGmailConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    console.log('[GMAIL] SMTP connection verified');
    return { success: true };
  } catch (error) {
    console.error('[GMAIL] SMTP connection failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Connection failed' 
    };
  }
}
