/**
 * Map activity / note types → candidate pipeline status.
 * When a note is logged with one of these types, status updates in the same action
 * (avoids a separate "stage change" activity row).
 */

/** Note types that imply a pipeline stage */
export const NOTE_TYPE_TO_STAGE: Record<string, string> = {
  // UI labels (value === label for most)
  Sourced: 'sourced',
  Applied: 'applied',
  Application: 'applied',
  Interested: 'interested',
  Submitted: 'submitted',
  'Interview Scheduled': 'interviewing',
  Interviewing: 'interviewing',
  Interview: 'interviewing',
  '2nd Interview': 'second_interview',
  '3rd Interview': 'third_interview',
  'Offer Out': 'offer_out',
  Accepted: 'converted',
  Placed: 'converted',
  'Offer Accepted': 'converted',
  'Left Message': 'left_message',
  Rejected: 'rejected',
  'Not Interested': 'not_interested',
  DNU: 'dnu',
  'Do Not Use': 'dnu',
  // snake_case / API aliases
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
  rejected: 'rejected',
  not_interested: 'not_interested',
  dnu: 'dnu',
  do_not_use: 'dnu',
};

/**
 * Preferred activity note type when the pipeline is moved via Advance / Reject.
 * Keeps the activity log consistent with stage-driving note types (no generic
 * "Stage change" rows that leave stage out of sync with the log).
 */
export const STAGE_TO_NOTE_TYPE: Record<string, string> = {
  left_message: 'Left Message',
  identification: 'Sourced',
  sourced: 'Sourced',
  applied: 'Applied',
  interested: 'Interested',
  submitted: 'Submitted',
  presented: 'Submitted',
  pre_screened: 'Submitted',
  interviewing: 'Interview Scheduled',
  interview: 'Interview Scheduled',
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

/**
 * Note types shown in the activity composer.
 * Stage-driving types first (after the placeholder).
 */
export const ACTIVITY_NOTE_TYPES = [
  { value: 'general', label: 'Action Type', drivesStage: false },
  { value: 'Conversation', label: 'Conversation', drivesStage: false },
  { value: 'Left Message', label: 'Left Message', drivesStage: true },
  { value: 'Sourced', label: 'Sourced', drivesStage: true },
  { value: 'Applied', label: 'Applied', drivesStage: true },
  { value: 'Interested', label: 'Interested', drivesStage: true },
  { value: 'Submitted', label: 'Submitted', drivesStage: true },
  { value: 'Interview Scheduled', label: 'Interview Scheduled', drivesStage: true },
  { value: '2nd Interview', label: '2nd Interview', drivesStage: true },
  { value: '3rd Interview', label: '3rd Interview', drivesStage: true },
  { value: 'Offer Out', label: 'Offer Out', drivesStage: true },
  { value: 'Accepted', label: 'Accepted', drivesStage: true },
  { value: 'Rejected', label: 'Rejected', drivesStage: true },
  { value: 'Not Interested', label: 'Not Interested', drivesStage: true },
  { value: 'DNU', label: 'DNU', drivesStage: true },
  { value: 'Email Sent', label: 'Email Sent', drivesStage: false },
  { value: 'Email Received', label: 'Email Received', drivesStage: false },
  { value: 'Text Sent', label: 'Text Sent', drivesStage: false },
  { value: 'Text Received', label: 'Text Received', drivesStage: false },
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

  // Fuzzy label match (order matters: not_interested before interested; 2nd/3rd before interview)
  if (lower.includes('not_interested') || lower.includes('not interested'))
    return 'not_interested';
  if (lower === 'dnu' || lower.includes('do_not_use') || lower.includes('do not use'))
    return 'dnu';
  if (lower.includes('reject')) return 'rejected';
  if (lower.includes('appl')) return 'applied';
  if (lower === 'interested' || lower.includes('interest')) return 'interested';
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
  if (lower.includes('left_message') || lower.includes('left message'))
    return 'left_message';
  if (lower.includes('sourc') || lower.includes('identif')) return 'sourced';
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
    identification: 'Sourced',
    sourced: 'Sourced',
    left_message: 'Left Message',
    contacted: 'Sourced',
    applied: 'Applied',
    application: 'Applied',
    interested: 'Interested',
    submitted: 'Submitted',
    presented: 'Submitted',
    conversation: 'Submitted',
    interviewing: 'Interview Scheduled',
    interview: 'Interview Scheduled',
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
