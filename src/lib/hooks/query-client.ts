
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

export const clientKeys = {
  all: ['clients'] as const,
  lists: () => [...clientKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...clientKeys.lists(), { filters }] as const,
  details: () => [...clientKeys.all, 'detail'] as const,
  detail: (id: string) => [...clientKeys.details(), id] as const,
};

export function useClients() {
  return useQuery({
    queryKey: clientKeys.lists(),
    queryFn: async () => {
      const result = await getClients();
      if (result.error) throw new Error(result.error);
      return result.clients || [];
    },
    enabled: false,   // Test mode - disables auto-fetch to stop loop
    staleTime: 1000 * 60 * 5,
  });
}

// Other hooks remain the same (addContact, etc.)
export function useClient(clientId: string) {
  return useQuery({
    queryKey: clientKeys.detail(clientId),
    queryFn: async () => {
      const result = await getClientByIdAction(clientId);
      if (result.error) throw new Error(result.error);
      return result.client;
    },
    enabled: !!clientId,
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
    onSuccess: () => toast.success('Contact added successfully'),
    onError: (error: any) => toast.error(error.message || 'Failed to add contact'),
  });
}

// Add the rest of your mutations as needed...
