/**
 * Contact / BD activity types (no numeric prefixes).
 * Past data may still store "01 Left Voicemail" — use stripActivityTypePrefix for display.
 */

export const CONTACT_ACTIVITY_TYPES = [
  'Left Voicemail',
  'Email Sent',
  'Email Received',
  'Text Sent',
  'Text Received',
  'LinkedIn Message Sent',
  'Conversation Engaged',
  'No Answer',
  'Initial Outreach',
  'Qualification Call',
  'Discovery Call',
  'Demo / Presentation',
  'Proposal Sent',
  'Proposal Review',
  'Contract Sent',
  'Contract Signed',
  'Meeting Scheduled',
  'Meeting Completed',
  'Follow-up Needed',
  'Follow-up Completed',
  'Note',
  'Other',
] as const;

export type ContactActivityType = (typeof CONTACT_ACTIVITY_TYPES)[number];

/** Strip leading "01 ", "08 " etc. from stored activity type labels */
export function stripActivityTypePrefix(type?: string | null): string {
  if (!type) return 'Note';
  return String(type)
    .replace(/^\s*\d+\s*[-.)]?\s*/u, '')
    .trim() || String(type).trim();
}

/** Normalize for comparison (case-insensitive, no prefix) */
export function normalizeActivityTypeKey(type?: string | null): string {
  return stripActivityTypePrefix(type).toLowerCase();
}
