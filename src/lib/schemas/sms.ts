import { z } from 'zod';

/**
 * SMS / texting schemas for Trio ATS.
 * Provider: AWS End User Messaging SMS (Pinpoint SMS Voice v2).
 * Stored in profiles table (same pattern as sequences / scheduling).
 */

export const smsDirectionSchema = z.enum(['outbound', 'inbound']);
export type SmsDirection = z.infer<typeof smsDirectionSchema>;

export const smsStatusSchema = z.enum([
  'queued',
  'sent',
  'delivered',
  'failed',
  'undelivered',
  'received',
  'blocked_opt_out',
  'blocked_compliance',
  'simulated',
]);
export type SmsStatus = z.infer<typeof smsStatusSchema>;

export const smsConsentSourceSchema = z.enum([
  'application',
  'prior_relationship',
  'verbal',
  'written',
  'inbound_start',
  'manual',
  'unknown',
]);
export type SmsConsentSource = z.infer<typeof smsConsentSourceSchema>;

/** Per-tenant texting configuration */
export const smsTenantConfigSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  type: z.literal('sms_tenant_config').default('sms_tenant_config'),
  enabled: z.boolean().default(false),
  /** Business / agency name prepended or required in first messages */
  businessName: z.string().max(200).default(''),
  /** Default signature line (e.g. "Reply STOP to opt out") */
  signature: z.string().max(160).default('Reply STOP to opt out'),
  /** Always append STOP notice on outbound marketing-style messages */
  appendOptOutNotice: z.boolean().default(true),
  /** Quiet hours — local to candidateTimezone or defaultTimezone */
  quietHoursEnabled: z.boolean().default(true),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).default('21:00'),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).default('08:00'),
  defaultTimezone: z.string().default('America/New_York'),
  /** Default country for 10-digit numbers */
  defaultCountry: z.enum(['US', 'CA']).default('US'),
  /** Origination identity (phone number E.164 or sender ID) — from AWS console */
  originationIdentity: z.string().max(30).optional(),
  /** Configuration set name for delivery events (optional) */
  configurationSetName: z.string().max(100).optional(),
  /** Allow cold / first-touch SMS (default false — safer for recruiting) */
  allowColdOutreach: z.boolean().default(false),
  /** Require recorded consent before first outbound */
  requireConsent: z.boolean().default(true),
  /** Max outbound SMS per tenant per calendar day */
  dailySendLimit: z.number().int().min(1).max(10000).default(200),
  updatedAt: z.string(),
  createdAt: z.string(),
  updatedBy: z.string().optional(),
});
export type SmsTenantConfig = z.infer<typeof smsTenantConfigSchema>;

export const updateSmsConfigInputSchema = z.object({
  enabled: z.boolean().optional(),
  businessName: z.string().max(200).optional(),
  signature: z.string().max(160).optional(),
  appendOptOutNotice: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  defaultTimezone: z.string().optional(),
  defaultCountry: z.enum(['US', 'CA']).optional(),
  originationIdentity: z.string().max(30).optional(),
  configurationSetName: z.string().max(100).optional(),
  allowColdOutreach: z.boolean().optional(),
  requireConsent: z.boolean().optional(),
  dailySendLimit: z.number().int().min(1).max(10000).optional(),
});
export type UpdateSmsConfigInput = z.infer<typeof updateSmsConfigInputSchema>;

/** Phone-level opt-out / consent record */
export const smsConsentRecordSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  type: z.literal('sms_consent').default('sms_consent'),
  phoneE164: z.string(),
  candidateId: z.string().optional(),
  status: z.enum(['opted_in', 'opted_out', 'unknown']).default('unknown'),
  source: smsConsentSourceSchema.default('unknown'),
  optedInAt: z.string().optional(),
  optedOutAt: z.string().optional(),
  lastKeyword: z.string().optional(),
  notes: z.string().max(1000).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SmsConsentRecord = z.infer<typeof smsConsentRecordSchema>;

export const smsMessageSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  type: z.literal('sms_message').default('sms_message'),
  direction: smsDirectionSchema,
  status: smsStatusSchema,
  candidateId: z.string().optional(),
  candidateName: z.string().optional(),
  phoneE164: z.string(),
  body: z.string().max(1600),
  segments: z.number().int().min(1).default(1),
  provider: z.enum(['aws', 'simulated']).default('aws'),
  providerMessageId: z.string().optional(),
  errorMessage: z.string().optional(),
  createdBy: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SmsMessage = z.infer<typeof smsMessageSchema>;

export const sendSmsInputSchema = z.object({
  candidateId: z.string().min(1),
  body: z.string().min(1).max(1500),
  phone: z.string().optional(),
  /** Override quiet hours (admin / urgent interview only) */
  bypassQuietHours: z.boolean().optional(),
  /** Record consent at send time */
  consentSource: smsConsentSourceSchema.optional(),
  markConsent: z.boolean().optional(),
});
export type SendSmsInput = z.infer<typeof sendSmsInputSchema>;

export const recordConsentInputSchema = z.object({
  phone: z.string().min(7),
  candidateId: z.string().optional(),
  status: z.enum(['opted_in', 'opted_out']),
  source: smsConsentSourceSchema.default('manual'),
  notes: z.string().max(1000).optional(),
});
export type RecordConsentInput = z.infer<typeof recordConsentInputSchema>;
