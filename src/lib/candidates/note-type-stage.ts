/**
 * Candidate note / activity types + pipeline stage mapping.
 * Canonical UI list is ACTIVITY_NOTE_TYPES (order = dropdown order).
 */

export type ActivityNoteType = {
  value: string;
  label: string;
  /** When true, logging this type also advances candidate pipeline status */
  drivesStage: boolean;
};

/**
 * Canonical activity types — order is UI order.
 * value === label for stable storage in event metadata.
 */
export const ACTIVITY_NOTE_TYPES: readonly ActivityNoteType[] = [
  { value: 'Applied', label: 'Applied', drivesStage: true },
  { value: 'Sourced', label: 'Sourced', drivesStage: true },
  { value: 'EM Sent', label: 'EM Sent', drivesStage: false },
  { value: 'EM Received', label: 'EM Received', drivesStage: false },
  { value: 'LM', label: 'LM', drivesStage: true },
  { value: 'Text Sent', label: 'Text Sent', drivesStage: false },
  { value: 'Text Received', label: 'Text Received', drivesStage: false },
  { value: 'Conversation', label: 'Conversation', drivesStage: false },
  { value: 'Interested', label: 'Interested', drivesStage: true },
  { value: 'Submitted', label: 'Submitted', drivesStage: true },
  { value: 'Follow-up', label: 'Follow-up', drivesStage: false },
  { value: 'Interview', label: 'Interview', drivesStage: true },
  { value: '2nd Interview', label: '2nd Interview', drivesStage: true },
  { value: '3rd Interview', label: '3rd Interview', drivesStage: true },
  { value: 'Offer Out', label: 'Offer Out', drivesStage: true },
  { value: 'Accepted', label: 'Accepted', drivesStage: true },
  { value: 'Rejected', label: 'Rejected', drivesStage: true },
  { value: 'Not Interested', label: 'Not Interested', drivesStage: true },
  { value: 'DNU', label: 'DNU', drivesStage: true },
  /** Candidate attached to a job req (system + optional manual) */
  { value: 'Attached', label: 'Attached', drivesStage: false },
  /** AI job-fit / applicant rating (system + optional manual) */
  { value: 'AI Review', label: 'AI Review', drivesStage: false },
  { value: 'Other', label: 'Other', drivesStage: false },
] as const;

const CANONICAL_LABELS = new Set(
  ACTIVITY_NOTE_TYPES.map((t) => t.label.toLowerCase())
);

/**
 * Map legacy / alternate note type strings → canonical label.
 * Unknown types become Other (display only; stored value unchanged until edit).
 */
const LEGACY_NOTE_TYPE_ALIASES: Record<string, string> = {
  // Email
  'email sent': 'EM Sent',
  email_sent: 'EM Sent',
  email: 'EM Sent',
  em_sent: 'EM Sent',
  'em sent': 'EM Sent',
  'email received': 'EM Received',
  email_received: 'EM Received',
  em_received: 'EM Received',
  'em received': 'EM Received',
  // Left message
  'left message': 'LM',
  left_message: 'LM',
  lm: 'LM',
  // Text
  'text sent': 'Text Sent',
  text_sent: 'Text Sent',
  'text received': 'Text Received',
  text_received: 'Text Received',
  // Interview renames
  interview: 'Interview',
  interviewing: 'Interview',
  'interview scheduled': 'Interview',
  interview_scheduled: 'Interview',
  'interview done': 'Interview',
  'interview completed': 'Interview',
  '2nd interview': '2nd Interview',
  '2nd_interview': '2nd Interview',
  second_interview: '2nd Interview',
  'second interview': '2nd Interview',
  '3rd interview': '3rd Interview',
  '3rd_interview': '3rd Interview',
  third_interview: '3rd Interview',
  'third interview': '3rd Interview',
  // Pipeline
  sourced: 'Sourced',
  applied: 'Applied',
  application: 'Applied',
  interested: 'Interested',
  submitted: 'Submitted',
  presented: 'Submitted',
  pre_screened: 'Submitted',
  'offer out': 'Offer Out',
  offer_out: 'Offer Out',
  accepted: 'Accepted',
  placed: 'Accepted',
  converted: 'Accepted',
  'offer accepted': 'Accepted',
  offer_accepted: 'Accepted',
  rejected: 'Rejected',
  'not interested': 'Not Interested',
  not_interested: 'Not Interested',
  dnu: 'DNU',
  'do not use': 'DNU',
  do_not_use: 'DNU',
  // Follow-up
  'follow-up': 'Follow-up',
  follow_up: 'Follow-up',
  followup: 'Follow-up',
  conversation: 'Conversation',
  // Catch-alls that are not in the new list → Other
  general: 'Other',
  'general note': 'Other',
  'action type': 'Other',
  phone_call: 'Other',
  'phone call': 'Other',
  call: 'Other',
  meeting: 'Other',
  proposal_sent: 'Other',
  'proposal sent': 'Other',
  contract_signed: 'Other',
  'contract signed': 'Other',
  placement_made: 'Other',
  'placement made': 'Other',
  check_in: 'Other',
  'check-in': 'Other',
  'check in': 'Other',
  stage_change: 'Other',
  'stage change': 'Other',
  job_linked: 'Attached',
  'job linked': 'Attached',
  linked: 'Attached',
  attach: 'Attached',
  attached: 'Attached',
  'attach job': 'Attached',
  'attached to job': 'Attached',
  ai_fit: 'AI Review',
  'ai fit': 'AI Review',
  'ai review': 'AI Review',
  aireview: 'AI Review',
  'fit score': 'AI Review',
  fit_score: 'AI Review',
  'ai assessment': 'AI Review',
  job_unlinked: 'Other',
  'job unlinked': 'Other',
  job_stage_change: 'Other',
  'job stage': 'Other',
  profile_updated: 'Other',
  'profile update': 'Other',
  'profile updated': 'Other',
  other: 'Other',
  note: 'Other',
};

/** Note types that imply a pipeline stage */
export const NOTE_TYPE_TO_STAGE: Record<string, string> = {
  Applied: 'applied',
  Sourced: 'sourced',
  LM: 'left_message',
  Interested: 'interested',
  Submitted: 'submitted',
  Interview: 'interviewing',
  '2nd Interview': 'second_interview',
  '3rd Interview': 'third_interview',
  'Offer Out': 'offer_out',
  Accepted: 'converted',
  Rejected: 'rejected',
  'Not Interested': 'not_interested',
  DNU: 'dnu',
  // aliases
  Application: 'applied',
  'Interview Scheduled': 'interviewing',
  Interviewing: 'interviewing',
  Placed: 'converted',
  'Offer Accepted': 'converted',
  'Left Message': 'left_message',
  'Do Not Use': 'dnu',
  sourced: 'sourced',
  applied: 'applied',
  application: 'applied',
  interested: 'interested',
  submitted: 'submitted',
  interviewing: 'interviewing',
  interview: 'interviewing',
  second_interview: 'second_interview',
  third_interview: 'third_interview',
  '2nd_interview': 'second_interview',
  '3rd_interview': 'third_interview',
  offer_out: 'offer_out',
  offer_accepted: 'converted',
  placed: 'converted',
  left_message: 'left_message',
  lm: 'left_message',
  rejected: 'rejected',
  not_interested: 'not_interested',
  dnu: 'dnu',
  do_not_use: 'dnu',
};

/**
 * Preferred activity note type when the pipeline is moved via Advance / Reject.
 */
export const STAGE_TO_NOTE_TYPE: Record<string, string> = {
  left_message: 'LM',
  identification: 'Sourced',
  sourced: 'Sourced',
  applied: 'Applied',
  interested: 'Interested',
  submitted: 'Submitted',
  presented: 'Submitted',
  pre_screened: 'Submitted',
  interviewing: 'Interview',
  interview: 'Interview',
  second_interview: '2nd Interview',
  third_interview: '3rd Interview',
  offer_out: 'Offer Out',
  converted: 'Accepted',
  placed: 'Accepted',
  offer_accepted: 'Accepted',
  rejected: 'Rejected',
  not_interested: 'Not Interested',
  dnu: 'DNU',
  do_not_use: 'DNU',
  offer_declined: 'Rejected',
  withdrawn: 'Rejected',
};

/** Normalize any stored / legacy note type to a canonical label for UI. */
export function normalizeNoteTypeLabel(
  raw?: string | null
): string {
  if (raw == null || !String(raw).trim()) return 'Other';
  const s = String(raw).trim();
  // Exact canonical match
  const exact = ACTIVITY_NOTE_TYPES.find(
    (t) => t.value === s || t.label === s
  );
  if (exact) return exact.label;

  const key = s.toLowerCase().replace(/\s+/g, ' ').trim();
  const keySnake = s.toLowerCase().replace(/\s+/g, '_');

  if (LEGACY_NOTE_TYPE_ALIASES[key]) return LEGACY_NOTE_TYPE_ALIASES[key];
  if (LEGACY_NOTE_TYPE_ALIASES[keySnake]) return LEGACY_NOTE_TYPE_ALIASES[keySnake];

  // Case-insensitive match against current list
  const lowerMatch = ACTIVITY_NOTE_TYPES.find(
    (t) => t.label.toLowerCase() === key || t.value.toLowerCase() === key
  );
  if (lowerMatch) return lowerMatch.label;

  if (CANONICAL_LABELS.has(key)) {
    const t = ACTIVITY_NOTE_TYPES.find((x) => x.label.toLowerCase() === key);
    if (t) return t.label;
  }

  // Fuzzy legacy
  if (key.includes('not interest')) return 'Not Interested';
  if (key === 'dnu' || key.includes('do not use') || key.includes('do_not_use'))
    return 'DNU';
  if (key.includes('2nd') || key.includes('second interview'))
    return '2nd Interview';
  if (key.includes('3rd') || key.includes('third interview'))
    return '3rd Interview';
  if (key.includes('interview')) return 'Interview';
  if (key.includes('email sent') || key === 'email') return 'EM Sent';
  if (key.includes('email received')) return 'EM Received';
  if (key.includes('left message')) return 'LM';
  if (key.includes('text sent')) return 'Text Sent';
  if (key.includes('text received')) return 'Text Received';
  if (key.includes('follow')) return 'Follow-up';
  if (key.includes('offer out')) return 'Offer Out';
  if (key.includes('submit')) return 'Submitted';
  if (key.includes('appl')) return 'Applied';
  if (key.includes('sourc') || key.includes('identif')) return 'Sourced';
  if (key === 'interested' || key.includes('interest')) return 'Interested';
  if (key.includes('reject')) return 'Rejected';
  if (key.includes('accept') || key.includes('plac') || key.includes('converted'))
    return 'Accepted';
  if (key.includes('conversation')) return 'Conversation';
  if (key.includes('attach') || key.includes('job linked') || key === 'job_linked')
    return 'Attached';
  if (
    key.includes('ai review') ||
    key.includes('ai fit') ||
    key === 'ai_fit' ||
    key.includes('fit score') ||
    (key.includes('ai') && key.includes('fit'))
  ) {
    return 'AI Review';
  }

  return 'Other';
}

/** Resolve canonical value for composer / save (same as label for new types). */
export function normalizeNoteTypeValue(raw?: string | null): string {
  return normalizeNoteTypeLabel(raw);
}

export function stageFromNoteType(noteType?: string | null): string | null {
  if (!noteType) return null;
  const raw = noteType.trim();
  if (
    !raw ||
    raw === 'stage_change' ||
    raw === 'general' ||
    raw === 'other' ||
    raw === 'Other'
  ) {
    return null;
  }

  // Prefer canonical label mapping
  const canonical = normalizeNoteTypeLabel(raw);
  if (canonical === 'Other') return null;

  const direct = NOTE_TYPE_TO_STAGE[canonical] || NOTE_TYPE_TO_STAGE[raw];
  if (direct) return direct;

  const lower = raw.toLowerCase().replace(/\s+/g, '_');
  const byLower = NOTE_TYPE_TO_STAGE[lower];
  if (byLower) return byLower;

  if (lower.includes('not_interested') || lower.includes('not interested'))
    return 'not_interested';
  if (lower === 'dnu' || lower.includes('do_not_use') || lower.includes('do not use'))
    return 'dnu';
  if (lower.includes('reject')) return 'rejected';
  if (lower.includes('appl')) return 'applied';
  if (lower === 'interested' || (lower.includes('interest') && !lower.includes('not')))
    return 'interested';
  if (lower.includes('submit')) return 'submitted';
  if (
    lower.includes('2nd') ||
    lower.includes('second_interview') ||
    lower.includes('second interview')
  )
    return 'second_interview';
  if (
    lower.includes('3rd') ||
    lower.includes('third_interview') ||
    lower.includes('third interview')
  )
    return 'third_interview';
  if (lower.includes('interview')) return 'interviewing';
  if (lower.includes('offer_out') || lower === 'offer' || lower.includes('offer out'))
    return 'offer_out';
  if (lower.includes('plac') || lower === 'accepted') return 'converted';
  if (
    lower.includes('left_message') ||
    lower.includes('left message') ||
    lower === 'lm'
  )
    return 'left_message';
  if (lower.includes('sourc') || lower.includes('identif')) return 'sourced';
  return null;
}

export function noteTypeFromStage(status?: string | null): string | null {
  if (!status) return null;
  const key = String(status).trim().toLowerCase().replace(/\s+/g, '_');
  return STAGE_TO_NOTE_TYPE[key] || null;
}

export function stageDisplayLabel(status: string): string {
  const map: Record<string, string> = {
    identification: 'Sourced',
    sourced: 'Sourced',
    left_message: 'LM',
    contacted: 'Sourced',
    applied: 'Applied',
    application: 'Applied',
    interested: 'Interested',
    submitted: 'Submitted',
    presented: 'Submitted',
    conversation: 'Conversation',
    interviewing: 'Interview',
    interview: 'Interview',
    second_interview: '2nd Interview',
    third_interview: '3rd Interview',
    offer_out: 'Offer Out',
    offer_accepted: 'Accepted',
    converted: 'Accepted',
    placed: 'Accepted',
    rejected: 'Rejected',
    not_interested: 'Not Interested',
    dnu: 'DNU',
    do_not_use: 'DNU',
  };
  return map[status] || status.replace(/_/g, ' ');
}

export function noteTypeDrivesStage(noteType?: string | null): boolean {
  return !!stageFromNoteType(noteType);
}
