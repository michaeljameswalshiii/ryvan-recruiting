/**
 * TanStack Query Hooks for Lead Data
 * Provides reactive data fetching with caching, loading states, and error handling
 * Includes toast notifications for user feedback
 * 
 * @clientOnly
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { 
  getLeads, 
  createLead, 
  updateLeadAction, 
  deleteLeadAction,
  updateLeadStatus 
} from '@/lib/actions/lead-actions';

// Query keys - used for cache invalidation
export const leadKeys = {
  all: ['leads'] as const,
  lists: () => [...leadKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...leadKeys.lists(), { filters }] as const,
  details: () => [...leadKeys.all, 'detail'] as const,
  detail: (id: string) => [...leadKeys.details(), id] as const,
};

/**
 * Get all leads for the current tenant
 * Includes loading and error states with retry
 */
export function useLeads() {
  return useQuery({
    queryKey: leadKeys.lists(),
    queryFn: async () => {
      console.log('[useLeads] Fetching leads...');
      const result = await getLeads();
      console.log(
        '[useLeads] tenant:',
        (result as any)?.tenantId,
        'count:',
        result?.leads?.length
      );

      if (result?.error) {
        console.error('[useLeads] Error:', result.error);
        throw new Error(result.error);
      }
      // === SAFE ARRAY GUARD ===
      return Array.isArray(result?.leads) ? result.leads : [];
    },
    // Always re-read after create/navigation so new candidates appear immediately
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

/**
 * Create a new lead
 * Invalidates lead list cache on success + shows toast
 */
export function useCreateLead() {
  const queryClient = useQueryClient();

return useMutation({
    mutationFn: async (formData: FormData) => {
      const result = await createLead(formData);
      // Handle undefined or null responses
      if (!result) {
        throw new Error('No response from server');
      }
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
onSuccess: () => {
      toast.success('Lead created successfully');
      // Invalidate lead queries
      queryClient.invalidateQueries({ queryKey: leadKeys.lists(), refetchType: 'all' });
      // Also invalidate dashboard queries so stats update
      queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['stats'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['clients'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['pipeline'], refetchType: 'all' });
    },
    onError: (error) => {
      toast.error('Failed to create lead', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

/**
 * Update an existing lead
 * Invalidates both list and detail cache + shows toast
 */
export function useUpdateLead() {
  const queryClient = useQueryClient();

return useMutation({
    mutationFn: async ({ leadId, formData }: { leadId: string; formData: FormData }) => {
      const result = await updateLeadAction(leadId, formData);
      if (!result) {
        throw new Error('No response from server');
      }
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: (_, variables) => {
      toast.success('Lead updated successfully');
      queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
      queryClient.invalidateQueries({ queryKey: leadKeys.detail(variables.leadId) });
    },
    onError: (error) => {
      toast.error('Failed to update lead', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

/**
 * Delete a lead
 * Removes from cache on success + shows toast
 */
export function useDeleteLead() {
  const queryClient = useQueryClient();

return useMutation({
    mutationFn: async (leadId: string) => {
      const result = await deleteLeadAction(leadId);
      if (!result) {
        throw new Error('No response from server');
      }
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      toast.success('Lead deleted successfully');
      queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
    },
    onError: (error) => {
      toast.error('Failed to delete lead', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

/**
 * Update lead status (for drag-and-drop)
 * Updates status in DynamoDB and records STATUS_CHANGE event
 */
export function useUpdateLeadStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadId, newStatus, oldStatus }: { leadId: string; newStatus: string; oldStatus: string }) => {
      const result = await updateLeadStatus(leadId, newStatus, oldStatus);
      if (!result) {
        throw new Error('No response from server');
      }
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: (_, variables) => {
      toast.success(`Moved to ${variables.newStatus}`);
      queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (error) => {
      toast.error('Failed to move candidate', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}
