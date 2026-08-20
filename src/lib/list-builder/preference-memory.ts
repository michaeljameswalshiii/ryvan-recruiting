/**
 * Format explicit recruiter accept/reject/revise labels for discovery prompts.
 * Unlabeled lists never appear here.
 *
 * @serverOnly
 */

import { listRecentListBuilderFeedback } from '@/lib/db/repositories/list-builder-feedback-repository';
import type { ListBuilderFeedbackEvent } from '@/lib/schemas/list-builder-feedback';

function exampleLine(e: ListBuilderFeedbackEvent['examples'][number]): string {
  const loc = [e.city, e.state].filter(Boolean).join(', ');
  const bits = [e.companyName];
  if (e.industry) bits.push(e.industry);
  if (loc) bits.push(loc);
  return bits.join(' · ');
}

function relevant(
  ev: ListBuilderFeedbackEvent,
  industry?: string,
  geography?: string
): boolean {
  const ind = (industry || '').toLowerCase();
  const geo = (geography || '').toLowerCase();
  if (!ind && !geo) return true;
  const hay = `${ev.industry || ''} ${ev.geography || ''} ${ev.brief}`.toLowerCase();
  if (ind && hay.includes(ind.slice(0, 18))) return true;
  if (geo && hay.includes(geo.slice(0, 18))) return true;
  return false;
}

export async function formatPreferenceMemoryBlock(opts: {
  tenantId: string;
  userId: string;
  industry?: string;
  geography?: string;
}): Promise<string> {
  if (!opts.tenantId || !opts.userId) return '';
  let events: ListBuilderFeedbackEvent[] = [];
  try {
    events = await listRecentListBuilderFeedback(opts.tenantId, opts.userId, 40);
  } catch {
    return '';
  }
  if (events.length === 0) return '';

  const scored = events.map((ev) => ({
    ev,
    hit: relevant(ev, opts.industry, opts.geography),
  }));
  const picked = [
    ...scored.filter((s) => s.hit),
    ...scored.filter((s) => !s.hit),
  ]
    .slice(0, 16)
    .map((s) => s.ev);

  const accepts = picked.filter((e) => e.action === 'accept');
  const rejects = picked.filter((e) => e.action === 'reject');
  const revises = picked.filter((e) => e.action === 'revise');

  const lines: string[] = [
    'Recruiter preference memory (explicit actions only — unlabeled lists are not signal):',
  ];

  if (accepts.length) {
    const names = accepts
      .flatMap((e) => e.examples)
      .slice(0, 10)
      .map(exampleLine);
    if (names.length) {
      lines.push(`ACCEPTED companies (import these kinds): ${names.join('; ')}`);
    }
  }
  if (rejects.length) {
    const names = rejects
      .flatMap((e) => e.examples)
      .slice(0, 10)
      .map(exampleLine);
    const reasons = rejects
      .map((e) => e.reason)
      .filter(Boolean)
      .slice(0, 4);
    if (names.length) {
      lines.push(`REJECTED companies (do not list these kinds): ${names.join('; ')}`);
    }
    if (reasons.length) {
      lines.push(`Reject reasons: ${reasons.join(' | ')}`);
    }
  }
  if (revises.length) {
    const last = revises[0];
    if (last.revisedBrief) {
      lines.push(
        `They revised a search toward: "${last.revisedBrief.slice(0, 220)}"`
      );
    }
  }

  if (lines.length <= 1) return '';
  return lines.join('\n');
}
