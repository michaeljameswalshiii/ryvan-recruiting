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
onSuccess: async (result) => {
      toast.success('Lead created successfully');
      // Optimistic insert when server returns the lead
      const lead = (result as any)?.lead;
      if (lead?.id) {
        queryClient.setQueryData(leadKeys.lists(), (prev: any) => {
          const list = Array.isArray(prev) ? prev : [];
          if (list.some((l: any) => String(l.id) === String(lead.id))) return list;
          return [lead, ...list];
        });
      }
      const { refreshCrmUi } = await import('./immediate-ui');
      await refreshCrmUi(queryClient, [
        leadKeys.all,
        ['dashboard'],
        ['dashboard-stats'],
        ['stats'],
        ['pipeline'],
      ]);
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
    onSuccess: async (result, variables) => {
      toast.success('Lead updated successfully');
      const lead = (result as any)?.lead;
      if (lead?.id) {
        queryClient.setQueryData(leadKeys.detail(variables.leadId), lead);
        queryClient.setQueryData(leadKeys.lists(), (prev: any) => {
          if (!Array.isArray(prev)) return prev;
          return prev.map((l: any) =>
            String(l.id) === String(variables.leadId) ? { ...l, ...lead } : l
          );
        });
      }
      const { refreshCrmUi } = await import('./immediate-ui');
      await refreshCrmUi(queryClient, [leadKeys.all]);
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
    onMutate: async (leadId) => {
      await queryClient.cancelQueries({ queryKey: leadKeys.lists() });
      const previous = queryClient.getQueryData(leadKeys.lists());
      queryClient.setQueryData(leadKeys.lists(), (prev: any) =>
        Array.isArray(prev)
          ? prev.filter((l: any) => String(l.id) !== String(leadId))
          : prev
      );
      return { previous };
    },
    onSuccess: async () => {
      toast.success('Lead deleted successfully');
      const { refreshCrmUi } = await import('./immediate-ui');
      await refreshCrmUi(queryClient, [leadKeys.all, ['dashboard'], ['stats']]);
    },
    onError: (error, _leadId, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(leadKeys.lists(), ctx.previous);
      }
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
    onMutate: async ({ leadId, newStatus }) => {
      await queryClient.cancelQueries({ queryKey: leadKeys.lists() });
      const previous = queryClient.getQueryData(leadKeys.lists());
      queryClient.setQueryData(leadKeys.lists(), (prev: any) =>
        Array.isArray(prev)
          ? prev.map((l: any) =>
              String(l.id) === String(leadId) ? { ...l, status: newStatus } : l
            )
          : prev
      );
      return { previous };
    },
    onSuccess: async (_, variables) => {
      toast.success(`Moved to ${variables.newStatus}`);
      const { refreshCrmUi } = await import('./immediate-ui');
      await refreshCrmUi(queryClient, [
        leadKeys.all,
        ['pipeline'],
        ['dashboard'],
        ['stats'],
      ]);
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(leadKeys.lists(), ctx.previous);
      }
      toast.error('Failed to move candidate', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}
