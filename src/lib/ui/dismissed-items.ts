/**
 * App-wide dismiss storage for follow-up / attention / next-action rows.
 * Browser-local, 30-day TTL. Keys are stable per feed + entity + action kind.
 */

export type DismissMap = Record<string, number>; // key → dismissedAt ms

/** Unified storage for all follow-up dismissals */
export const FOLLOWUP_DISMISS_STORAGE_KEY = 'trio-followups-dismissed-v1';

/** Legacy Needs attention key — migrated on first load */
const LEGACY_ATTENTION_KEY = 'trio-needs-attention-dismissed-v1';

export const FOLLOWUP_DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type FollowupFeed =
  | 'attention'
  | 'desk'
  | 'job_next'
  | 'sales_stale'
  | 'open_req'
  | string;

/**
 * Build a stable dismiss key.
 * Include actionKind so a new kind of follow-up for the same person can reappear.
 */
export function buildDismissKey(parts: {
  feed: FollowupFeed;
  entityType: string;
  entityId: string;
  actionKind?: string;
  extra?: string;
}): string {
  const segs = [
    parts.feed,
    parts.entityType,
    parts.entityId,
    parts.actionKind || '',
    parts.extra || '',
  ].map((s) => String(s || '').trim());
  return segs.join(':').replace(/:+$/g, '');
}

function pruneExpired(map: DismissMap, now = Date.now()): DismissMap {
  const fresh: DismissMap = {};
  for (const [k, ts] of Object.entries(map)) {
    if (typeof ts === 'number' && now - ts < FOLLOWUP_DISMISS_TTL_MS) {
      fresh[k] = ts;
    }
  }
  return fresh;
}

function readRaw(key: string): DismissMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DismissMap;
    if (!parsed || typeof parsed !== 'object') return {};
    return pruneExpired(parsed);
  } catch {
    return {};
  }
}

function writeRaw(key: string, map: DismissMap): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

/**
 * Load dismiss map; migrates legacy Needs attention keys into the unified store.
 */
export function loadDismissedItems(): DismissMap {
  if (typeof window === 'undefined') return {};
  let map = readRaw(FOLLOWUP_DISMISS_STORAGE_KEY);

  // One-time migration: attention:type:id from old flat "type:id" keys
  try {
    const legacy = readRaw(LEGACY_ATTENTION_KEY);
    let changed = false;
    for (const [oldKey, ts] of Object.entries(legacy)) {
      // old format: "candidate:uuid" or "job:uuid"
      const migrated = oldKey.includes(':')
        ? `attention:${oldKey}`
        : `attention:item:${oldKey}`;
      if (!map[migrated]) {
        map[migrated] = ts;
        changed = true;
      }
    }
    if (changed) {
      map = pruneExpired(map);
      writeRaw(FOLLOWUP_DISMISS_STORAGE_KEY, map);
      try {
        localStorage.removeItem(LEGACY_ATTENTION_KEY);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore migration errors */
  }

  return map;
}

export function saveDismissedItems(map: DismissMap): void {
  writeRaw(FOLLOWUP_DISMISS_STORAGE_KEY, pruneExpired(map));
}

export function isDismissed(map: DismissMap, key: string): boolean {
  if (!key) return false;
  const ts = map[key];
  if (typeof ts !== 'number') return false;
  return Date.now() - ts < FOLLOWUP_DISMISS_TTL_MS;
}

export function dismissKeyInMap(map: DismissMap, key: string): DismissMap {
  const next = { ...map, [key]: Date.now() };
  saveDismissedItems(next);
  return next;
}

export function undismissKeyInMap(map: DismissMap, key: string): DismissMap {
  const next = { ...map };
  delete next[key];
  saveDismissedItems(next);
  return next;
}

/** Clear all keys for a feed prefix, e.g. feed "desk" → "desk:..." */
export function clearFeedInMap(map: DismissMap, feed: FollowupFeed): DismissMap {
  const prefix = `${feed}:`;
  const next: DismissMap = {};
  for (const [k, ts] of Object.entries(map)) {
    if (!k.startsWith(prefix)) next[k] = ts;
  }
  saveDismissedItems(next);
  return next;
}

export function clearAllDismissed(): DismissMap {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(FOLLOWUP_DISMISS_STORAGE_KEY);
      localStorage.removeItem(LEGACY_ATTENTION_KEY);
    } catch {
      /* ignore */
    }
  }
  return {};
}

export function countDismissedForKeys(
  map: DismissMap,
  keys: string[]
): number {
  return keys.filter((k) => isDismissed(map, k)).length;
}
