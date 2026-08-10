/**
 * TanStack Query Hooks for Pipeline Data
 * Provides reactive data fetching with caching, loading states, and error handling
 * Includes toast notifications for user feedback
 * 
 * @clientOnly
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { 
  getPipeline, 
  getPipelineByIdAction,
  createPipeline, 
  updatePipelineAction, 
  deletePipelineAction 
} from '@/lib/actions/pipeline-actions';

// Query keys - used for cache invalidation
export const pipelineKeys = {
  all: ['pipeline'] as const,
  lists: () => [...pipelineKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...pipelineKeys.lists(), { filters }] as const,
  details: () => [...pipelineKeys.all, 'detail'] as const,
  detail: (id: string) => [...pipelineKeys.details(), id] as const,
};

/**
 * Get all pipeline items for the current tenant
 * Includes loading and error states with retry
 */
export function usePipeline() {
  return useQuery({
    queryKey: pipelineKeys.lists(),
    queryFn: async () => {
      console.log('[QUERY-PIPELINE] Fetching pipeline data');
      try {
        const result = await getPipeline();
        console.log('[QUERY-PIPELINE] Result:', result);
        if (result.error) {
          console.error('[QUERY-PIPELINE] Error from server action:', result.error);
          throw new Error(result.error);
        }
        return result.pipeline || [];
      } catch (err: any) {
        console.error('[QUERY-PIPELINE] Query error:', err?.message, err?.stack);
        throw err;
      }
    },
    staleTime: 0, // immediate UI - mutations refresh active queries
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Get a single pipeline item by ID
 */
export function usePipelineItem(pipelineId: string) {
  return useQuery({
    queryKey: pipelineKeys.detail(pipelineId),
    queryFn: async () => {
      const result = await getPipelineByIdAction(pipelineId);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.pipeline;
    },
    enabled: !!pipelineId,
    staleTime: 0,
  });
}

/**
 * Create a new pipeline item
 * Invalidates pipeline list cache on success + shows toast
 */
export function useCreatePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      const result = await createPipeline(formData);
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: async () => {
      toast.success('Added to pipeline successfully');
      const { refreshCrmUi } = await import('./immediate-ui');
      await refreshCrmUi(queryClient, [
        pipelineKeys.all,
        ['dashboard'],
        ['dashboard-stats'],
        ['stats'],
        ['leads'],
        ['clients'],
      ]);
    },
    onError: (error) => {
      toast.error('Failed to add to pipeline', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

/**
 * Update an existing pipeline item
 * Invalidates both list and detail cache + shows toast
 */
export function useUpdatePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pipelineId, formData }: { pipelineId: string; formData: FormData }) => {
      const result = await updatePipelineAction(pipelineId, formData);
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: async (_, variables) => {
      toast.success('Pipeline updated successfully');
      const { refreshCrmUi } = await import('./immediate-ui');
      await refreshCrmUi(queryClient, [
        pipelineKeys.all,
        pipelineKeys.detail(variables.pipelineId),
      ]);
    },
    onError: (error) => {
      toast.error('Failed to update pipeline', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

/**
 * Delete a pipeline item
 * Removes from cache on success + shows toast
 */
export function useDeletePipeline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pipelineId: string) => {
      const result = await deletePipelineAction(pipelineId);
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onMutate: async (pipelineId) => {
      await queryClient.cancelQueries({ queryKey: pipelineKeys.lists() });
      const previous = queryClient.getQueryData(pipelineKeys.lists());
      queryClient.setQueryData(pipelineKeys.lists(), (prev: any) =>
        Array.isArray(prev)
          ? prev.filter((p: any) => String(p.id) !== String(pipelineId))
          : prev
      );
      return { previous };
    },
    onSuccess: async () => {
      toast.success('Removed from pipeline successfully');
      const { refreshCrmUi } = await import('./immediate-ui');
      await refreshCrmUi(queryClient, [pipelineKeys.all]);
    },
    onError: (error, _id, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(pipelineKeys.lists(), ctx.previous);
      }
      toast.error('Failed to remove from pipeline', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}
