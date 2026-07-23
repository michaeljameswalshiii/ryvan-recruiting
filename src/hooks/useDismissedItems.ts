'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type DismissMap,
  type FollowupFeed,
  buildDismissKey,
  clearAllDismissed,
  clearFeedInMap,
  dismissKeyInMap,
  isDismissed,
  loadDismissedItems,
  undismissKeyInMap,
} from '@/lib/ui/dismissed-items';

/**
 * Shared dismiss state for follow-up / attention / next-action rows.
 */
export function useDismissedItems() {
  const [map, setMap] = useState<DismissMap>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setMap(loadDismissedItems());
    setHydrated(true);
  }, []);

  const dismiss = useCallback((key: string) => {
    if (!key) return;
    setMap((prev) => dismissKeyInMap(prev, key));
  }, []);

  const undismiss = useCallback((key: string) => {
    if (!key) return;
    setMap((prev) => undismissKeyInMap(prev, key));
  }, []);

  const clearFeed = useCallback((feed: FollowupFeed) => {
    setMap((prev) => clearFeedInMap(prev, feed));
  }, []);

  const clearAll = useCallback(() => {
    setMap(clearAllDismissed());
  }, []);

  const isHidden = useCallback(
    (key: string) => (hydrated ? isDismissed(map, key) : false),
    [map, hydrated]
  );

  return {
    map,
    hydrated,
    dismiss,
    undismiss,
    clearFeed,
    clearAll,
    isHidden,
    buildKey: buildDismissKey,
  };
}

/** Filter a list by dismiss keys; keep original order. */
export function useFilterDismissed<T>(
  items: T[],
  getKey: (item: T) => string,
  opts?: { limit?: number }
): {
  visible: T[];
  dismissedCount: number;
  dismiss: (key: string) => void;
  clearFeed: (feed: FollowupFeed) => void;
  clearAll: () => void;
  hydrated: boolean;
  buildKey: typeof buildDismissKey;
} {
  const api = useDismissedItems();
  const visible = useMemo(() => {
    if (!api.hydrated) {
      return opts?.limit != null ? items.slice(0, opts.limit) : items;
    }
    const filtered = items.filter((item) => !api.isHidden(getKey(item)));
    return opts?.limit != null ? filtered.slice(0, opts.limit) : filtered;
  }, [items, api.hydrated, api.map, getKey, opts?.limit, api.isHidden]);

  const dismissedCount = useMemo(() => {
    if (!api.hydrated) return 0;
    return items.filter((item) => api.isHidden(getKey(item))).length;
  }, [items, api.hydrated, api.map, getKey, api.isHidden]);

  return {
    visible,
    dismissedCount,
    dismiss: api.dismiss,
    clearFeed: api.clearFeed,
    clearAll: api.clearAll,
    hydrated: api.hydrated,
    buildKey: api.buildKey,
  };
}
