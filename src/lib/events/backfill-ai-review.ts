/**
 * Retroactively retag AI fit activity events from "Other" → "AI Review".
 *
 * @serverOnly
 */

import {
  eventsTable,
  scanItems,
  updateItem,
} from '@/lib/db/dynamodb';

export type BackfillAiReviewResult = {
  scanned: number;
  matched: number;
  updated: number;
  skipped: number;
  dryRun: boolean;
  samples: Array<{
    entityId?: string;
    sk?: string;
    before?: string;
    title?: string;
  }>;
};

type EventRow = {
  PK?: string;
  SK?: string;
  entityId?: string;
  entityType?: string;
  eventType?: string;
  title?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  tenantId?: string;
};

/** True if this event is an AI fit / applicant rating note. */
export function isAiFitActivityEvent(item: EventRow): boolean {
  const meta = (item.metadata || {}) as Record<string, unknown>;
  if (meta.systemKind === 'ai_fit') return true;

  const noteText = String(meta.noteText || item.description || '');
  const title = String(item.title || '');

  if (/^ai fit for/i.test(noteText.trim())) return true;
  if (/^ai review/i.test(noteText.trim())) return true;
  if (/ai fit\s*·/i.test(title) || /^ai review/i.test(title)) return true;

  // Older rows: fitScore stored + Other note type + fit-ish body
  if (typeof meta.fitScore === 'number') {
    const nt = String(meta.noteType || meta.noteTypeLabel || '').toLowerCase();
    if (
      !nt ||
      nt === 'other' ||
      nt === 'general' ||
      nt.includes('ai') ||
      nt.includes('fit')
    ) {
      if (
        /ai fit|fit score|domain\s+\d|overall\s+\d|grade\s+[a-f]/i.test(
          noteText + ' ' + title
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function needsAiReviewLabel(item: EventRow): boolean {
  if (!isAiFitActivityEvent(item)) return false;
  const meta = (item.metadata || {}) as Record<string, unknown>;
  const nt = String(meta.noteType || '');
  const ntl = String(meta.noteTypeLabel || '');
  return nt !== 'AI Review' || ntl !== 'AI Review';
}

/**
 * Scan candidate events table and retag AI fit rows to AI Review.
 * Prefer dryRun: true first.
 */
export async function backfillAiReviewNoteTypes(options?: {
  dryRun?: boolean;
  /** Limit updates (safety cap) */
  maxUpdates?: number;
}): Promise<BackfillAiReviewResult> {
  const dryRun = options?.dryRun !== false; // default dry-run for safety
  const maxUpdates = options?.maxUpdates ?? 50_000;

  // Prefer filter to reduce payload; still code-filter for edge cases
  let rows: EventRow[] = [];
  try {
    rows = await scanItems<EventRow>(
      eventsTable,
      'begins_with(SK, :skPrefix)',
      { ':skPrefix': 'EVENT#' }
    );
  } catch {
    // FilterExpression alone may need attribute names on some tables — fall back full scan
    rows = await scanItems<EventRow>(eventsTable);
  }

  // Keep only candidate activity events
  const events = rows.filter(
    (r) =>
      typeof r.SK === 'string' &&
      r.SK.startsWith('EVENT#') &&
      (r.entityType === 'candidate' ||
        (typeof r.PK === 'string' && r.PK.startsWith('ENTITY#candidate#')))
  );

  const result: BackfillAiReviewResult = {
    scanned: events.length,
    matched: 0,
    updated: 0,
    skipped: 0,
    dryRun,
    samples: [],
  };

  for (const item of events) {
    if (!needsAiReviewLabel(item)) {
      if (isAiFitActivityEvent(item)) result.skipped++;
      continue;
    }

    result.matched++;
    const before = String(
      (item.metadata as { noteType?: string } | undefined)?.noteType || 'Other'
    );

    if (result.samples.length < 15) {
      result.samples.push({
        entityId: item.entityId,
        sk: item.SK,
        before,
        title: item.title,
      });
    }

    if (dryRun) continue;
    if (result.updated >= maxUpdates) break;

    if (!item.PK || !item.SK) {
      result.skipped++;
      continue;
    }

    const meta = {
      ...(item.metadata || {}),
      noteType: 'AI Review',
      noteTypeLabel: 'AI Review',
      systemKind:
        (item.metadata as { systemKind?: string } | undefined)?.systemKind ||
        'ai_fit',
      backfilledAiReviewAt: new Date().toISOString(),
    };

    let title = item.title;
    if (title && /note\s*-\s*other/i.test(title)) {
      title = title.replace(/note\s*-\s*other/i, 'Note - AI Review');
    } else if (title && /^AI fit\s*·/i.test(title)) {
      title = title.replace(/^AI fit/i, 'AI Review');
    } else if (!title || /^Note\b/i.test(title)) {
      const job =
        (item.metadata as { jobTitle?: string } | undefined)?.jobTitle || '';
      title = job ? `AI Review · ${job}` : 'AI Review';
    }

    await updateItem(
      eventsTable,
      { PK: item.PK, SK: item.SK },
      'SET #title = :title, #metadata = :metadata',
      {
        ':title': title,
        ':metadata': meta,
      },
      {
        '#title': 'title',
        '#metadata': 'metadata',
      }
    );
    result.updated++;
  }

  return result;
}
