/**
 * Map activity / note types → candidate pipeline status.
 * When a note is logged with one of these types, status updates in the same action
 * (avoids a separate "stage change" activity row).
 */

/** Note types that imply a pipeline stage */
export const NOTE_TYPE_TO_STAGE: Record<string, string> = {
  // UI labels (value === label for most)
  Submitted: 'submitted',
  'Interview Scheduled': 'interviewing',
  Interviewing: 'interviewing',
  Interview: 'interviewing',
  'Offer Out': 'offer_out',
  Accepted: 'converted',
  Placed: 'converted',
  'Offer Accepted': 'converted',
  'Left Message': 'left_message',
  Rejected: 'rejected',
  'Not Interested': 'not_interested',
  // snake_case / API aliases
  submitted: 'submitted',
  interviewing: 'interviewing',
  interview: 'interviewing',
  offer_out: 'offer_out',
  offer_accepted: 'converted',
  placed: 'converted',
  left_message: 'left_message',
  rejected: 'rejected',
  not_interested: 'not_interested',
  // Explicit null-ish: never treat these as stage drivers
  // (omit empty string — empty is falsy and confused stageFromNoteType)
};

/**
 * Preferred activity note type when the pipeline is moved via Advance / Reject.
 * Keeps the activity log consistent with stage-driving note types (no generic
 * "Stage change" rows that leave stage out of sync with the log).
 */
export const STAGE_TO_NOTE_TYPE: Record<string, string> = {
  left_message: 'Left Message',
  identification: 'Conversation',
  sourced: 'Conversation',
  submitted: 'Submitted',
  presented: 'Submitted',
  pre_screened: 'Submitted',
  interviewing: 'Interview Scheduled',
  interview: 'Interview Scheduled',
  offer_out: 'Offer Out',
  converted: 'Accepted',
  placed: 'Accepted',
  offer_accepted: 'Accepted',
  rejected: 'Rejected',
  not_interested: 'Not Interested',
  offer_declined: 'Rejected',
  withdrawn: 'Rejected',
};

/**
 * Note types shown in the activity composer.
 * Stage-driving types first (after the placeholder).
 */
export const ACTIVITY_NOTE_TYPES = [
  { value: 'general', label: 'Action Type', drivesStage: false },
  { value: 'Conversation', label: 'Conversation', drivesStage: false },
  { value: 'Left Message', label: 'Left Message', drivesStage: true },
  { value: 'Submitted', label: 'Submitted', drivesStage: true },
  { value: 'Interview Scheduled', label: 'Interview Scheduled', drivesStage: true },
  { value: 'Offer Out', label: 'Offer Out', drivesStage: true },
  { value: 'Accepted', label: 'Accepted', drivesStage: true },
  { value: 'Rejected', label: 'Rejected', drivesStage: true },
  { value: 'Email Sent', label: 'Email Sent', drivesStage: false },
  { value: 'phone_call', label: 'Phone call', drivesStage: false },
  { value: 'follow_up', label: 'Follow-up', drivesStage: false },
  { value: 'meeting', label: 'Meeting', drivesStage: false },
  { value: 'other', label: 'Other', drivesStage: false },
] as const;

export function stageFromNoteType(noteType?: string | null): string | null {
  if (!noteType) return null;
  // Never treat generic / system types as stage drivers
  const raw = noteType.trim();
  if (!raw || raw === 'stage_change' || raw === 'general' || raw === 'other') {
    return null;
  }

  const direct = NOTE_TYPE_TO_STAGE[raw];
  if (direct) return direct;

  const lower = raw.toLowerCase().replace(/\s+/g, '_');
  const byLower = NOTE_TYPE_TO_STAGE[lower];
  if (byLower) return byLower;

  // Fuzzy label match (avoid matching "stage_change" via accidental substrings)
  if (lower.includes('submit')) return 'submitted';
  if (lower.includes('interview')) return 'interviewing';
  if (lower.includes('offer_out') || lower === 'offer' || lower.includes('offer out'))
    return 'offer_out';
  if (lower.includes('plac') || lower === 'accepted') return 'converted';
  if (lower.includes('reject') || lower.includes('not_interested'))
    return 'rejected';
  if (lower.includes('left_message') || lower.includes('left message'))
    return 'left_message';
  return null;
}

/** Reverse map: pipeline status → preferred activity note type label/value */
export function noteTypeFromStage(status?: string | null): string | null {
  if (!status) return null;
  const key = String(status).trim().toLowerCase().replace(/\s+/g, '_');
  return STAGE_TO_NOTE_TYPE[key] || null;
}

/** Human label for pipeline status values */
export function stageDisplayLabel(status: string): string {
  const map: Record<string, string> = {
    identification: 'Identified',
    sourced: 'Identified',
    left_message: 'Left Message',
    contacted: 'Identified',
    submitted: 'Submitted',
    presented: 'Submitted',
    conversation: 'Submitted',
    interviewing: 'Interviewing',
    interview: 'Interviewing',
    offer_out: 'Offer Out',
    offer_accepted: 'Accepted',
    converted: 'Accepted',
    placed: 'Accepted',
    rejected: 'Rejected',
    not_interested: 'Not Interested',
  };
  return map[status] || status.replace(/_/g, ' ');
}

export function noteTypeDrivesStage(noteType?: string | null): boolean {
  return !!stageFromNoteType(noteType);
}
