/**
 * Activity / note-type badge colors aligned to the product badge palette.
 * Does NOT rename activity types — colors only.
 *
 * Palette sources (bg / text):
 * Jobs: created, open/active, submitted, interview, offer, filled, on hold, covered, cancelled, lost
 * Contacts: contact added, phone, voicemail, text, email sent/received, meeting, note, reference, DNC, opted out
 * Companies: company added, prospect, qualified, active client, meeting, agreement, proposal, on hold, inactive, lost
 */

import type { CSSProperties } from 'react';

export type ActivityBadgeColors = {
  backgroundColor: string;
  color: string;
  borderColor: string;
};

/** Shared chips — Tailwind-free so dark mode ink rules cannot wash them out */
export const ACTIVITY_BADGE_BASE_CLASS =
  'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium';

// Hex pairs from design sheets (background / text)
const P = {
  emailSent: { bg: '#DBEAFE', text: '#1D4ED8' }, // Email sent / Job created
  emailReceived: { bg: '#E0F2FE', text: '#0369A1' }, // Email received
  openActive: { bg: '#DCFCE7', text: '#15803D' }, // Open/active, phone conversation, lead qualified
  filledPlaced: { bg: '#DCFCE7', text: '#166534' }, // Filled / placed
  offer: { bg: '#D1FAE5', text: '#059669' }, // Offer extended, agreement signed, active client
  submitted: { bg: '#EDE9FE', text: '#7C3AED' }, // Candidate submitted
  noteAdded: { bg: '#F3E8FF', text: '#7C3AED' }, // Note added
  prospect: { bg: '#EDE9FE', text: '#9333EA' }, // Prospect
  contactAdded: { bg: '#E0E7FF', text: '#4338CA' }, // Contact / company added, proposal-ish indigo
  interviewSched: { bg: '#FED7AA', text: '#EA580C' }, // Interview scheduled, meeting
  interviewDone: { bg: '#FDE68A', text: '#B45309' }, // Interview completed
  voicemail: { bg: '#FEF3C7', text: '#B45309' }, // Left voicemail
  onHold: { bg: '#FEF3C7', text: '#CA8A04' }, // On hold
  textMsg: { bg: '#CFFAFE', text: '#0E7490' }, // Text message, covered
  reference: { bg: '#FCE7F3', text: '#BE185D' }, // Reference call
  lost: { bg: '#FEE2E2', text: '#DC2626' }, // Lost / cancelled competitor / DNC
  optedOut: { bg: '#FECACA', text: '#991B1B' }, // Opted out
  cancelled: { bg: '#F3F4F6', text: '#4B5563' }, // Cancelled / inactive / other
  inactive: { bg: '#F3F4F6', text: '#525252' },
} as const;

function pair(p: { bg: string; text: string }): ActivityBadgeColors {
  // Soft border: same family as bg, slightly stronger than fill
  return {
    backgroundColor: p.bg,
    color: p.text,
    borderColor: p.bg === '#F3F4F6' ? '#D1D5DB' : p.text,
  };
}

/**
 * Resolve badge colors for any activity label (candidate, contact, company, job).
 * Matching is by meaning; labels themselves are unchanged.
 */
export function resolveActivityBadgeColors(
  label: string | null | undefined
): ActivityBadgeColors {
  const l = String(label || '')
    .toLowerCase()
    .trim();

  // --- Email ---
  if (
    l.includes('em sent') ||
    l.includes('email sent') ||
    l === 'email' ||
    l === 'email_sent'
  ) {
    return pair(P.emailSent);
  }
  if (l.includes('em received') || l.includes('email received')) {
    return pair(P.emailReceived);
  }

  // --- Text ---
  if (l.includes('text sent') || l.includes('text received') || l.includes('text message')) {
    return pair(P.textMsg);
  }

  // --- Voicemail / LM ---
  if (
    l === 'lm' ||
    l.includes('left message') ||
    l.includes('voicemail') ||
    l.includes('left voicemail')
  ) {
    return pair(P.voicemail);
  }

  // --- Phone / conversation ---
  if (
    l.includes('phone conversation') ||
    l.includes('phone call') ||
    (l.includes('conversation') && !l.includes('email'))
  ) {
    return pair(P.openActive);
  }
  if (l.includes('intake') || (l.includes('call') && !l.includes('reference'))) {
    return pair(P.openActive);
  }

  // --- Interview ---
  if (l.includes('2nd') || l.includes('3rd') || l.includes('interview completed') || l.includes('interview done')) {
    return pair(P.interviewDone);
  }
  if (l.includes('interview') || l.includes('meeting scheduled') || l.includes('meeting logged')) {
    return pair(P.interviewSched);
  }
  if (l.includes('meeting') || l.includes('client call')) {
    return pair(P.interviewSched);
  }

  // --- Offer / accepted / placed ---
  if (l.includes('offer')) return pair(P.offer);
  if (
    l.includes('accept') ||
    l.includes('placed') ||
    l.includes('filled') ||
    l.includes('converted') ||
    l.includes('hired') ||
    l.includes('contract signed') ||
    l.includes('agreement')
  ) {
    return pair(P.filledPlaced);
  }

  // --- Submitted / applied ---
  if (l.includes('submit') || l.includes('presented') || l.includes('pre_screen')) {
    return pair(P.submitted);
  }
  if (l.includes('applied') || l === 'application') {
    return pair(P.submitted);
  }

  // --- Pipeline positive ---
  if (l.includes('interested') && !l.includes('not')) {
    return pair(P.openActive);
  }
  if (l.includes('sourced') || l.includes('identification')) {
    return pair(P.emailSent); // job created / open blue
  }
  if (l.includes('open') || l.includes('active client') || l.includes('lead qualified')) {
    return pair(P.openActive);
  }

  // --- Follow-up / covered ---
  if (l.includes('follow')) return pair(P.textMsg);
  if (l.includes('covered')) return pair(P.textMsg);

  // --- Attached / job created / contact added ---
  if (
    l.includes('attach') ||
    l.includes('job linked') ||
    l.includes('candidate linked') ||
    l.includes('job created')
  ) {
    return pair(P.emailSent);
  }
  if (l.includes('contact added') || l.includes('company added')) {
    return pair(P.contactAdded);
  }
  if (l.includes('prospect')) return pair(P.prospect);

  // --- AI Review / notes ---
  if (
    l.includes('ai review') ||
    l.includes('ai fit') ||
    l === 'ai_fit' ||
    (l.includes('ai') && l.includes('fit'))
  ) {
    return pair(P.noteAdded);
  }
  if (l.includes('note added') || l.includes('general note') || l === 'note' || l === 'general') {
    return pair(P.noteAdded);
  }

  // --- LinkedIn / proposal / contract sent ---
  if (l.includes('linkedin')) return pair(P.emailReceived);
  if (l.includes('proposal')) return pair(P.contactAdded);
  if (l.includes('contract sent') || l.includes('submittal')) {
    return pair(P.emailSent);
  }

  // --- Negative / hold ---
  if (l.includes('on hold') || l.includes('hold')) return pair(P.onHold);
  if (
    l.includes('opted out') ||
    l.includes('opt-out') ||
    l.includes('opt out')
  ) {
    return pair(P.optedOut);
  }
  if (
    l.includes('do not contact') ||
    l.includes('lost to competitor') ||
    l.includes('lost') ||
    l.includes('churn')
  ) {
    return pair(P.lost);
  }
  if (
    l.includes('reject') ||
    l.includes('not interest') ||
    l === 'dnu' ||
    l.includes('do not use')
  ) {
    return pair(P.lost);
  }
  if (l.includes('cancel') || l.includes('inactive') || l.includes('unlink')) {
    return pair(P.cancelled);
  }

  // --- Reference ---
  if (l.includes('reference')) return pair(P.reference);

  // --- Placement / check-in ---
  if (l.includes('placement') || l.includes('check-in') || l.includes('check in')) {
    return pair(P.offer);
  }

  // --- Stage / status ---
  if (l.includes('stage') || l.includes('status')) {
    return pair(P.prospect);
  }

  // Default — cancelled/neutral gray
  return pair(P.cancelled);
}

/** React style object for badge elements */
export function activityBadgeStyle(
  label: string | null | undefined
): CSSProperties {
  const c = resolveActivityBadgeColors(label);
  return {
    backgroundColor: c.backgroundColor,
    color: c.color,
    borderColor: c.borderColor,
    borderWidth: 1,
    borderStyle: 'solid',
    WebkitTextFillColor: c.color,
  };
}
