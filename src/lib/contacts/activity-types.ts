/**
 * Contact / BD activity types (dropdown order = display order).
 * Past data may store old labels or "01 Left Voicemail" prefixes —
 * use normalizeContactActivityType for display (unknown → Other).
 */

export const CONTACT_ACTIVITY_TYPES = [
  'EM Sent',
  'EM Received',
  'Text Sent',
  'Text Received',
  'LM',
  'Conversation',
  'Intake Call',
  'Proposal',
  'Contract Sent',
  'Contract Signed',
  'LinkedIn Message',
  'Follow-up',
  'Other',
] as const;

export type ContactActivityType = (typeof CONTACT_ACTIVITY_TYPES)[number];

const CANONICAL = new Set(
  CONTACT_ACTIVITY_TYPES.map((t) => t.toLowerCase())
);

/** Legacy / alternate labels → canonical (or Other) */
const LEGACY_ALIASES: Record<string, ContactActivityType | string> = {
  // Email
  'email sent': 'EM Sent',
  email_sent: 'EM Sent',
  em_sent: 'EM Sent',
  'em sent': 'EM Sent',
  email: 'EM Sent',
  'email received': 'EM Received',
  email_received: 'EM Received',
  em_received: 'EM Received',
  'em received': 'EM Received',
  // Text
  'text sent': 'Text Sent',
  text_sent: 'Text Sent',
  'text received': 'Text Received',
  text_received: 'Text Received',
  // Left message / voicemail
  lm: 'LM',
  'left voicemail': 'LM',
  'left message': 'LM',
  left_message: 'LM',
  left_voicemail: 'LM',
  voicemail: 'LM',
  // Conversation
  conversation: 'Conversation',
  'conversation engaged': 'Conversation',
  conversation_engaged: 'Conversation',
  // Calls → map closest or Other
  'intake call': 'Intake Call',
  intake_call: 'Intake Call',
  'qualification call': 'Intake Call',
  'discovery call': 'Intake Call',
  'initial outreach': 'Other',
  'no answer': 'Other',
  'demo / presentation': 'Other',
  demo: 'Other',
  // Proposal
  proposal: 'Proposal',
  'proposal sent': 'Proposal',
  proposal_sent: 'Proposal',
  'proposal review': 'Proposal',
  // Contract
  'contract sent': 'Contract Sent',
  contract_sent: 'Contract Sent',
  'contract signed': 'Contract Signed',
  contract_signed: 'Contract Signed',
  // LinkedIn
  'linkedin message': 'LinkedIn Message',
  'linkedin message sent': 'LinkedIn Message',
  linkedin_message: 'LinkedIn Message',
  linkedin: 'LinkedIn Message',
  // Follow-up
  'follow-up': 'Follow-up',
  follow_up: 'Follow-up',
  followup: 'Follow-up',
  'follow-up needed': 'Follow-up',
  'follow-up completed': 'Follow-up',
  // Meetings / notes not in list → Other
  'meeting scheduled': 'Other',
  'meeting completed': 'Other',
  meeting: 'Other',
  note: 'Other',
  general: 'Other',
  phone_call: 'Other',
  'phone call': 'Other',
  call: 'Other',
  other: 'Other',
};

/** Strip leading "01 ", "08 " etc. from stored activity type labels */
export function stripActivityTypePrefix(type?: string | null): string {
  if (!type) return 'Other';
  return (
    String(type)
      .replace(/^\s*\d+\s*[-.)]?\s*/u, '')
      .trim() || String(type).trim()
  );
}

/** Normalize for comparison (case-insensitive, no prefix) */
export function normalizeActivityTypeKey(type?: string | null): string {
  return stripActivityTypePrefix(type).toLowerCase();
}

/**
 * Map any stored contact activity type to the canonical dropdown list.
 * Unknown / removed types → Other.
 */
export function normalizeContactActivityType(
  type?: string | null
): string {
  if (type == null || !String(type).trim()) return 'Other';
  const stripped = stripActivityTypePrefix(type);
  const exact = CONTACT_ACTIVITY_TYPES.find(
    (t) => t === stripped || t.toLowerCase() === stripped.toLowerCase()
  );
  if (exact) return exact;

  const key = stripped.toLowerCase().replace(/\s+/g, ' ').trim();
  const keySnake = stripped.toLowerCase().replace(/\s+/g, '_');
  if (LEGACY_ALIASES[key]) return LEGACY_ALIASES[key];
  if (LEGACY_ALIASES[keySnake]) return LEGACY_ALIASES[keySnake];

  if (CANONICAL.has(key)) {
    return (
      CONTACT_ACTIVITY_TYPES.find((t) => t.toLowerCase() === key) || 'Other'
    );
  }

  // Fuzzy
  if (key.includes('email sent') || key === 'email') return 'EM Sent';
  if (key.includes('email received')) return 'EM Received';
  if (key.includes('text sent')) return 'Text Sent';
  if (key.includes('text received')) return 'Text Received';
  if (
    key.includes('voicemail') ||
    key.includes('left message') ||
    key === 'lm'
  )
    return 'LM';
  if (key.includes('linkedin')) return 'LinkedIn Message';
  if (key.includes('contract signed')) return 'Contract Signed';
  if (key.includes('contract sent') || key.includes('contract'))
    return key.includes('sign') ? 'Contract Signed' : 'Contract Sent';
  if (key.includes('proposal')) return 'Proposal';
  if (key.includes('intake') || key.includes('qualification') || key.includes('discovery'))
    return 'Intake Call';
  if (key.includes('follow')) return 'Follow-up';
  if (key.includes('conversation') || key.includes('engaged'))
    return 'Conversation';

  return 'Other';
}
