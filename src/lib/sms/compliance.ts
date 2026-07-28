/**
 * SMS compliance helpers: keywords, quiet hours, message composition.
 *
 * This is product enforcement for TCPA-style hygiene — not legal advice.
 * Tenants should confirm consent practices with counsel for their use cases.
 */

import type { SmsTenantConfig } from '@/lib/schemas/sms';
import { estimateSmsSegments } from './phone';

export type KeywordAction = 'stop' | 'start' | 'help' | 'none';

const STOP_WORDS = new Set([
  'stop',
  'stopall',
  'unsubscribe',
  'cancel',
  'end',
  'quit',
]);
const START_WORDS = new Set(['start', 'unstop', 'yes', 'subscribe']);
const HELP_WORDS = new Set(['help', 'info']);

export function classifyInboundKeyword(body: string): KeywordAction {
  const t = body.trim().toLowerCase().replace(/[!.]+$/g, '');
  if (!t) return 'none';
  // Single-token keywords only for auto-handling
  const token = t.split(/\s+/)[0];
  if (STOP_WORDS.has(token) || STOP_WORDS.has(t)) return 'stop';
  if (START_WORDS.has(token) || START_WORDS.has(t)) return 'start';
  if (HELP_WORDS.has(token) || HELP_WORDS.has(t)) return 'help';
  return 'none';
}

export function helpAutoReply(config: SmsTenantConfig): string {
  const name = config.businessName || 'this recruiting team';
  return `${name}: For help, contact your recruiter. Msg frequency varies. Msg&data rates may apply. Reply STOP to opt out.`;
}

export function stopAutoReply(config: SmsTenantConfig): string {
  const name = config.businessName || 'Us';
  return `${name}: You are unsubscribed and will not receive more texts. Reply START to re-subscribe.`;
}

export function startAutoReply(config: SmsTenantConfig): string {
  const name = config.businessName || 'Us';
  return `${name}: You are re-subscribed to recruiting messages. Reply STOP to opt out.`;
}

/**
 * Quiet hours check in a given IANA timezone (best-effort via Intl).
 * Returns true if currently inside quiet window (should not send).
 */
export function isInQuietHours(
  config: SmsTenantConfig,
  timeZone?: string,
  now: Date = new Date()
): boolean {
  if (!config.quietHoursEnabled) return false;
  const tz = timeZone || config.defaultTimezone || 'America/New_York';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(
      parts.find((p) => p.type === 'minute')?.value || '0',
      10
    );
    // hour can be 24 in some locales
    const h = hour === 24 ? 0 : hour;
    const mins = h * 60 + minute;
    const [sh, sm] = config.quietHoursStart.split(':').map(Number);
    const [eh, em] = config.quietHoursEnd.split(':').map(Number);
    const start = (sh || 0) * 60 + (sm || 0);
    const end = (eh || 0) * 60 + (em || 0);
    // Window crosses midnight (e.g. 21:00–08:00)
    if (start > end) {
      return mins >= start || mins < end;
    }
    return mins >= start && mins < end;
  } catch {
    return false;
  }
}

/**
 * Compose final outbound body with identity + STOP notice.
 */
export function composeOutboundBody(
  rawBody: string,
  config: SmsTenantConfig,
  opts?: { isFirstMessage?: boolean }
): { body: string; segments: number } {
  let body = rawBody.trim();
  const name = (config.businessName || '').trim();

  // Prepend business name on first-touch style if not already present
  if (opts?.isFirstMessage && name) {
    const lower = body.toLowerCase();
    if (!lower.includes(name.toLowerCase())) {
      body = `${name}: ${body}`;
    }
  }

  if (config.appendOptOutNotice) {
    const notice = (config.signature || 'Reply STOP to opt out').trim();
    if (notice && !body.toLowerCase().includes('stop')) {
      body = `${body}\n\n${notice}`;
    }
  }

  // Cap at 1500 for multi-segment safety
  if (body.length > 1500) {
    body = body.slice(0, 1497) + '…';
  }

  return { body, segments: estimateSmsSegments(body) };
}

export type ComplianceBlockReason =
  | 'opted_out'
  | 'consent_required'
  | 'quiet_hours'
  | 'daily_limit'
  | 'disabled'
  | 'no_origination'
  | 'invalid_phone';

export function complianceBlockMessage(reason: ComplianceBlockReason): string {
  switch (reason) {
    case 'opted_out':
      return 'This number has opted out (STOP). Record START/consent before texting again.';
    case 'consent_required':
      return 'Consent required before first text. Record opt-in on the candidate or disable requireConsent in Settings.';
    case 'quiet_hours':
      return 'Quiet hours are active. Disable quiet hours or wait until morning (or use bypass for urgent only).';
    case 'daily_limit':
      return 'Daily SMS send limit reached for this workspace.';
    case 'disabled':
      return 'Texting is disabled. Enable it under Settings → Texting.';
    case 'no_origination':
      return 'No origination number configured. Set origination identity in Settings → Texting (from AWS console).';
    case 'invalid_phone':
      return 'Invalid phone number.';
    default:
      return 'Message blocked by compliance rules.';
  }
}
