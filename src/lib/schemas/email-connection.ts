/**
 * User Email Connection Schema
 * Zod schema for email OAuth connections (Gmail/Outlook)
 */

import { z } from 'zod';

// Email provider types
export const emailProviderSchema = z.enum(['gmail', 'outlook']);
export type EmailProvider = z.infer<typeof emailProviderSchema>;

// Email connection status
export const connectionStatusSchema = z.enum(['active', 'expired', 'revoked', 'error']);
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;

// User email connection schema
export const userEmailConnectionSchema = z.object({
  // Primary key
  userId: z.string(),
  provider: emailProviderSchema,
  emailAddress: z.string().email(),
  
  // OAuth tokens (refresh token should be encrypted)
  refreshToken: z.string(),
  accessToken: z.string().optional(),
  tokenType: z.string().optional().default('Bearer'),
  
  // Expiry
  expiresAt: z.number().optional(), // Unix timestamp
  
  // Sync tracking
  lastSyncedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  
  // Webhook subscription
  subscriptionId: z.string().optional(),
  
  // Status
  status: connectionStatusSchema.optional().default('active'),
  
  // Error info (if any)
  errorMessage: z.string().optional(),
});

export type UserEmailConnection = z.infer<typeof userEmailConnectionSchema>;

// Create input (without computed fields)
export const createEmailConnectionSchema = userEmailConnectionSchema.omit({
  createdAt: true,
  updatedAt: true,
  lastSyncedAt: true,
}).extend({
  expiresAt: z.number(),
});

export type CreateEmailConnectionInput = z.infer<typeof createEmailConnectionSchema>;

// Update input
export const updateEmailConnectionSchema = userEmailConnectionSchema.partial().pick({
  accessToken: true,
  tokenType: true,
  expiresAt: true,
  lastSyncedAt: true,
  subscriptionId: true,
  status: true,
  errorMessage: true,
});

export type UpdateEmailConnectionInput = z.infer<typeof updateEmailConnectionSchema>;

// Email send options
export const sendEmailOptionsSchema = z.object({
  from: z.string().email(), // Sender's connected email
  to: z.string().email(), // Recipient email
  replyTo: z.string().email().optional(), // For threading
  subject: z.string().min(1, 'Subject is required'),
  text: z.string().optional(),
  html: z.string().optional(),
  // Threading headers
  threadId: z.string().optional(),
  references: z.string().optional(),
  inReplyTo: z.string().optional(),
  // Metadata
  candidateId: z.string().optional(),
  candidateEmail: z.string().optional(),
});

export type SendEmailOptions = z.infer<typeof sendEmailOptionsSchema>;

// Helper to create connection ID (partition key)
export function getConnectionId(userId: string, provider: EmailProvider): string {
  return `${userId}#${provider}`;
}

// Helper to get connection from storage key
export function parseConnectionId(connectionId: string): { userId: string; provider: EmailProvider } {
  const [userId, provider] = connectionId.split('#');
  return { 
    userId, 
    provider: provider as EmailProvider 
  };
}
