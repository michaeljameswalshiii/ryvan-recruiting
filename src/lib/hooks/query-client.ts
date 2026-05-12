/**
 * TanStack Query Hooks for Client Data
 * Provides reactive data fetching with caching, loading states, and error handling
 * Includes toast notifications for user feedback
 * 
 * @clientOnly
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { 
  getClients, 
  getClientByIdAction, 
  createClient, 
  updateClientAction, 
  deleteClientAction 
} from '@/lib/actions/client-actions';

// Query keys - used for cache invalidation
export const clientKeys = {
  all: ['clients'] as const,
  lists: () => [...clientKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...clientKeys.lists(), { filters }] as const,
  details: () => [...clientKeys.all, 'detail'] as const,
  detail: (id: string) => [...clientKeys.details(), id] as const,
};

/**
 * Get all clients for the current tenant
 * Includes loading and error states
 */
export function useClients() {
  return useQuery({
    queryKey: clientKeys.lists(),
    queryFn: async () => {
      const result = await getClients();
      if (result.error) {
        throw new Error(result.error);
      }
      return result.clients || [];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
  });
}

/**
 * Get a single client by ID
 */
export function useClient(clientId: string) {
  return useQuery({
    queryKey: clientKeys.detail(clientId),
    queryFn: async () => {
      const result = await getClientByIdAction(clientId);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.client;
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Create a new client
 * Invalidates client list cache on success + shows toast
 */
export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      const result = await createClient(formData);
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
onSuccess: () => {
      toast.success('Client created successfully');
      queryClient.invalidateQueries({ queryKey: clientKeys.lists(), refetchType: 'all' });
      // Also invalidate dashboard queries so stats update
      queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['stats'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['leads'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['pipeline'], refetchType: 'all' });
    },
    onError: (error) => {
      toast.error('Failed to create client', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

/**
 * Update an existing client
 * Invalidates both list and detail cache + shows toast
 */
export function useUpdateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ clientId, formData }: { clientId: string; formData: FormData }) => {
      const result = await updateClientAction(clientId, formData);
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: (_, variables) => {
      toast.success('Client updated successfully');
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(variables.clientId) });
    },
    onError: (error) => {
      toast.error('Failed to update client', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

/**
 * Delete a client
 * Removes from cache on success + shows toast
 */
export function useDeleteClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (clientId: string) => {
      const result = await deleteClientAction(clientId);
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    },
    onSuccess: () => {
      toast.success('Client deleted successfully');
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
    },
    onError: (error) => {
      toast.error('Failed to delete client', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}
