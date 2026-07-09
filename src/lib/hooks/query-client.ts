/**
 * TanStack Query Hooks for Client Data
 * Provides reactive data fetching with caching, loading states, and error handling
 * Includes toast notifications for user feedback
 * 
 * @clientOnly
 */

'use client';

import { useEffect } from 'react';
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
 * Get all clients for the current tenant
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
    staleTime: 1000 * 60 * 5,
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
      if (result.error) throw new Error(result.error);
      return result.client;
    },
    enabled: !!clientId,
    staleTime: 1000 * 60 * 5,
  });
}

// ... (keep your existing useCreateClient, useUpdateClient, useDeleteClient, useUpdateClientStatus) ...

/**
 * Add a contact to a client - IMPROVED
 */
export function useAddContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clientId,
      contactData,
    }: {
      clientId: string;
      contactData: any;
    }) => {
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
      console.error('[useAddContact] Error:', error);
      const message = error instanceof Error ? error.message : 'Failed to add contact. Please try again.';
      toast.error('Failed to add contact', { description: message });
    },
  });
}

// Similar improvements for update and remove contact...

export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ clientId, contactId, contactData }: any) => {
      const result = await updateContactAction(clientId, contactId, contactData);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (_, variables) => {
      toast.success('Contact updated successfully');
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(variables.clientId) });
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
    },
    onError: (error: any) => {
      const message = error instanceof Error ? error.message : 'Failed to update contact';
      toast.error('Failed to update contact', { description: message });
    },
  });
}

export function useRemoveContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ clientId, contactId }: any) => {
      const result = await removeContactAction(clientId, contactId);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: (_, variables) => {
      toast.success('Contact removed successfully');
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(variables.clientId) });
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
    },
    onError: (error: any) => {
      const message = error instanceof Error ? error.message : 'Failed to remove contact';
      toast.error('Failed to remove contact', { description: message });
    },
  });
}
