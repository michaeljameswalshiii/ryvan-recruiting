'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getClients,
  getClientByIdAction,
  createClient,
  updateClientAction,
  updateClientStatusAction,
  deleteClientAction,
  addContactAction,
  updateContactAction,
  removeContactAction
} from '@/lib/actions/client-actions';

// Query keys
export const clientKeys = {
  all: ['clients'] as const,
  lists: () => [...clientKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...clientKeys.lists(), { filters }] as const,
  details: () => [...clientKeys.all, 'detail'] as const,
  detail: (id: string) => [...clientKeys.details(), id] as const,
};

/**
 * Get all clients - Stable version
 */
export function useClients() {
  return useQuery({
    queryKey: clientKeys.lists(),
    queryFn: async () => {
      console.log('[useClients] Fetching clients...');
      const result = await getClients();
      
      if (result.error) {
        console.error('[useClients] Error:', result.error);
        throw new Error(result.error);
      }
      
      console.log('[useClients] Loaded', result.clients?.length || 0, 'clients');
      return result.clients || [];
    },
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 15,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function useClient(clientId: string) {
  return useQuery({
    queryKey: clientKeys.detail(clientId),
    queryFn: async () => {
      const result = await getClientByIdAction(clientId);
      if (result.error) throw new Error(result.error);
      return result.client;
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 5,
  });
}

export function useAddContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ clientId, contactData }: any) => {
      const result = await addContactAction(clientId, contactData);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (_, variables) => {
      toast.success('Contact added successfully');
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(variables.clientId) });
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
    },
    onError: (error: any) => {
      const message = error instanceof Error ? error.message : 'Failed to add contact. Please try again.';
      toast.error('Failed to add contact', { description: message });
    },
  });
}

// Add other mutations as needed (useUpdateContact, useRemoveContact, etc.)

export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      const result = await createClient(formData);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success('Client created successfully');
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
    },
    onError: (error) => {
      toast.error('Failed to create client', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    },
  });
}

// You can add the rest of your mutations here if needed
