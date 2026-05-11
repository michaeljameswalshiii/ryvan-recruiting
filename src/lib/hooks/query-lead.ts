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
  deleteLeadAction 
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
      const result = await getLeads();
      if (result.error) {
        throw new Error(result.error);
      }
      return result.leads || [];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
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
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      toast.success('Lead created successfully');
      queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
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
