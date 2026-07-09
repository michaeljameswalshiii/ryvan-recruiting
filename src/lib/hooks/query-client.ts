'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getClients, addContactAction } from '@/lib/actions/client-actions';

// Clients Query
export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: getClients,
  });
}

// Single Client (for detail pages)
export function useClient(clientId: string) {
  return useQuery({
    queryKey: ['client', clientId],
    queryFn: async () => {
      console.log('Fetching single client:', clientId);
      return null; // placeholder - implement if needed
    },
    enabled: !!clientId,
  });
}

// Create
export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      console.log('Creating client');
      return { success: true };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });
}

// Delete
export function useDeleteClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (clientId: string) => {
      console.log('Deleting client:', clientId);
      return { success: true };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });
}
