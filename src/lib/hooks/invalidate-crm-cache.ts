/**
 * Invalidate React Query caches after AI / external CRM mutations.
 * Server tools write DynamoDB directly; list UIs only refresh when these keys clear.
 *
 * @clientSafe
 */

import type { QueryClient } from '@tanstack/react-query';
import { clientKeys } from './client-keys';
import { leadKeys } from './query-lead';
import { jobKeys } from './query-job';
import { pipelineKeys } from './query-pipeline';

/** Tools that mutate companies / contacts */
const CLIENT_TOOLS = new Set([
  'create_company',
  'update_company',
  'create_contact',
  'update_contact',
  'create_client',
  'update_client',
]);

/** Tools that mutate candidates / leads */
const CANDIDATE_TOOLS = new Set([
  'create_candidate',
  'update_candidate',
  'update_candidate_stage',
  'link_candidate_to_job',
  'update_job_candidate_stage',
]);

/** Tools that mutate jobs */
const JOB_TOOLS = new Set([
  'create_job',
  'update_job',
  'link_candidate_to_job',
  'update_job_candidate_stage',
]);

/**
 * Map AI tool names → CRM entity buckets that should refetch.
 */
export function crmEntitiesTouchedByTools(toolsUsed: string[]): {
  clients: boolean;
  candidates: boolean;
  jobs: boolean;
  pipeline: boolean;
  any: boolean;
} {
  const tools = (toolsUsed || []).map((t) =>
    String(t || '')
      .trim()
      .toLowerCase()
  );
  const clients = tools.some((t) => CLIENT_TOOLS.has(t));
  const candidates = tools.some((t) => CANDIDATE_TOOLS.has(t));
  const jobs = tools.some((t) => JOB_TOOLS.has(t));
  // Stage / link changes affect pipeline boards
  const pipeline = candidates || jobs;
  return {
    clients,
    candidates,
    jobs,
    pipeline,
    any: clients || candidates || jobs || pipeline,
  };
}

/**
 * Invalidate (and refetch active) CRM list/detail queries.
 * Call after AI assistant responses that used write tools.
 */
export async function invalidateCrmCaches(
  queryClient: QueryClient,
  toolsUsed: string[],
  options?: {
    forceClients?: boolean;
    forceAll?: boolean;
    /**
     * Soft: mark caches stale without forcing a full refetch of every query.
     * Use after bulk list-builder import so Chrome doesn't reload the entire
     * company list in one shot on the results page.
     */
    soft?: boolean;
  }
): Promise<void> {
  const touched = crmEntitiesTouchedByTools(toolsUsed);
  if (options?.forceAll) {
    touched.clients = true;
    touched.candidates = true;
    touched.jobs = true;
    touched.pipeline = true;
    touched.any = true;
  } else if (options?.forceClients) {
    touched.clients = true;
    touched.any = true;
  }
  if (!touched.any) return;

  // soft → none (stale only); default → all (previous behavior for small AI writes)
  const refetchType = options?.soft ? ('none' as const) : ('all' as const);

  const tasks: Promise<unknown>[] = [];

  if (touched.clients) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: clientKeys.all,
        refetchType,
      })
    );
  }
  if (touched.candidates) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: leadKeys.all,
        refetchType,
      })
    );
  }
  if (touched.jobs) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: jobKeys.all,
        refetchType,
      })
    );
  }
  if (touched.pipeline) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: pipelineKeys.all,
        refetchType,
      })
    );
  }

  // Dashboard widgets that aggregate counts
  tasks.push(
    queryClient.invalidateQueries({
      queryKey: ['dashboard'],
      refetchType,
    })
  );
  tasks.push(
    queryClient.invalidateQueries({ queryKey: ['stats'], refetchType })
  );

  await Promise.all(tasks);

  // Cross-tab / other open windows: same origin listeners can refetch
  try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const ch = new BroadcastChannel('trio-crm-invalidate');
      ch.postMessage({
        type: 'crm-invalidate',
        toolsUsed,
        at: Date.now(),
      });
      ch.close();
    }
  } catch {
    /* ignore */
  }
}

/**
 * Subscribe once (e.g. in app providers) so list pages open in other tabs refresh.
 */
export function subscribeCrmCacheBroadcast(queryClient: QueryClient): () => void {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
    return () => {};
  }
  const ch = new BroadcastChannel('trio-crm-invalidate');
  const onMessage = (ev: MessageEvent) => {
    const tools = Array.isArray(ev.data?.toolsUsed) ? ev.data.toolsUsed : [];
    void invalidateCrmCaches(queryClient, tools.length ? tools : [
      'create_company',
      'create_contact',
      'create_candidate',
      'create_job',
    ]);
  };
  ch.addEventListener('message', onMessage);
  return () => {
    ch.removeEventListener('message', onMessage);
    ch.close();
  };
}
