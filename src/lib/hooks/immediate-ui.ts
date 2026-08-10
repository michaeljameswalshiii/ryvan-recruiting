/**
 * Immediate UI updates after mutations.
 *
 * Convention for all CRM mutations (candidates, jobs, companies, contacts, pipeline):
 * 1. Optimistically update React Query cache (or local state) in onMutate / before await
 * 2. Call the API
 * 3. On success: confirm cache with server payload when available, invalidate active queries
 * 4. On error: roll back optimistic data and toast
 *
 * Never wait solely on router.refresh() for list correctness — it is secondary.
 *
 * @clientOnly
 */

"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { clientKeys } from "./client-keys";
import { leadKeys } from "./query-lead";
import { jobKeys } from "./query-job";
import { pipelineKeys } from "./query-pipeline";

/** Default CRM query keys to refresh after a write */
export const CRM_QUERY_ROOTS: QueryKey[] = [
  leadKeys.all,
  jobKeys.all,
  clientKeys.all,
  pipelineKeys.all,
  ["dashboard"],
  ["dashboard-stats"],
  ["stats"],
  ["contacts"],
];

/**
 * Mark queries stale and refetch anything currently mounted.
 * Call after every successful mutation that affects CRM data.
 */
export async function refreshCrmUi(
  queryClient: QueryClient,
  roots: QueryKey[] = CRM_QUERY_ROOTS
): Promise<void> {
  await Promise.all(
    roots.map((queryKey) =>
      queryClient.invalidateQueries({
        queryKey,
        refetchType: "active",
      })
    )
  );

  try {
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      const ch = new BroadcastChannel("trio-crm-invalidate");
      ch.postMessage({
        type: "crm-invalidate",
        toolsUsed: ["ui_mutation"],
        at: Date.now(),
      });
      ch.close();
    }
  } catch {
    /* ignore */
  }
}

/**
 * Apply an optimistic update to a query cache; returns previous data for rollback.
 */
export function optimisticSet<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  updater: (previous: T | undefined) => T
): T | undefined {
  const previous = queryClient.getQueryData<T>(queryKey);
  queryClient.setQueryData<T>(queryKey, updater(previous));
  return previous;
}

/**
 * Restore a previous query snapshot after a failed optimistic mutation.
 */
export function rollbackOptimistic<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  previous: T | undefined
): void {
  if (previous === undefined) {
    queryClient.removeQueries({ queryKey });
  } else {
    queryClient.setQueryData(queryKey, previous);
  }
}

/**
 * Snapshot multiple query keys for multi-key optimistic rollback.
 */
export function snapshotQueries(
  queryClient: QueryClient,
  keys: QueryKey[]
): Array<{ key: QueryKey; data: unknown }> {
  return keys.map((key) => ({
    key,
    data: queryClient.getQueryData(key),
  }));
}

export function restoreSnapshots(
  queryClient: QueryClient,
  snaps: Array<{ key: QueryKey; data: unknown }>
): void {
  for (const s of snaps) {
    if (s.data === undefined) {
      queryClient.removeQueries({ queryKey: s.key });
    } else {
      queryClient.setQueryData(s.key, s.data);
    }
  }
}
