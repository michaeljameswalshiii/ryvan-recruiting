'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { addContactAction, updateContactAction, removeContactAction } from '@/lib/actions/client-actions';
import { clientKeys } from './client-keys';

/**
 * Add a contact to a client - UI hook with improved error handling
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
      
      if (result.error) {
        throw new Error(result.error);   // This ensures the real error message is thrown
      }
      
      return result;
    },
    onSuccess: async (_, variables) => {
      toast.success('Contact added successfully');
      const { refreshCrmUi } = await import('./immediate-ui');
      await refreshCrmUi(queryClient, [
        clientKeys.detail(variables.clientId),
        clientKeys.lists(),
        ['contacts'],
      ]);
    },
    onError: (error: any) => {
      console.error('[useAddContact] Error:', error);
      const message = error instanceof Error ? error.message : 'Failed to add contact. Please try again.';
      toast.error('Failed to add contact', { 
        description: message 
      });
    },
  });
}

/**
 * Update a contact
 */
export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clientId,
      contactId,
      contactData,
    }: {
      clientId: string;
      contactId: string;
      contactData: any;
    }) => {
      const result = await updateContactAction(clientId, contactId, contactData);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: async (_, variables) => {
      toast.success('Contact updated successfully');
      const { refreshCrmUi } = await import('./immediate-ui');
      await refreshCrmUi(queryClient, [
        clientKeys.detail(variables.clientId),
        clientKeys.lists(),
        ['contacts'],
      ]);
    },
    onError: (error: any) => {
      const message = error instanceof Error ? error.message : 'Failed to update contact';
      toast.error('Failed to update contact', { description: message });
    },
  });
}

/**
 * Remove a contact
 */
export function useRemoveContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clientId,
      contactId,
    }: {
      clientId: string;
      contactId: string;
    }) => {
      const result = await removeContactAction(clientId, contactId);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: async (_, variables) => {
      toast.success('Contact removed successfully');
      const { refreshCrmUi } = await import('./immediate-ui');
      await refreshCrmUi(queryClient, [
        clientKeys.detail(variables.clientId),
        clientKeys.lists(),
        ['contacts'],
      ]);
    },
    onError: (error: any) => {
      const message = error instanceof Error ? error.message : 'Failed to remove contact';
      toast.error('Failed to remove contact', { description: message });
    },
  });
}
