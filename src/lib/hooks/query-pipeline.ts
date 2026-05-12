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
    staleTime: 1000 * 60 * 5, // 5 minutes
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
    staleTime: 1000 * 60 * 5,
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
    onSuccess: () => {
      toast.success('Added to pipeline successfully');
      // Invalidate pipeline queries
      queryClient.invalidateQueries({ queryKey: pipelineKeys.lists(), refetchType: 'all' });
      // Invalidate dashboard queries so stats update
      queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['stats'], refetchType: 'all' });
      // Invalidate other data sources that may be affected
      queryClient.invalidateQueries({ queryKey: ['clients'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['leads'], refetchType: 'all' });
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
    onSuccess: (_, variables) => {
      toast.success('Pipeline updated successfully');
      queryClient.invalidateQueries({ queryKey: pipelineKeys.lists() });
      queryClient.invalidateQueries({ queryKey: pipelineKeys.detail(variables.pipelineId) });
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
    onSuccess: () => {
      toast.success('Removed from pipeline successfully');
      queryClient.invalidateQueries({ queryKey: pipelineKeys.lists() });
    },
    onError: (error) => {
      toast.error('Failed to remove from pipeline', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}
