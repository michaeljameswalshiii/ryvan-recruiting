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

// Create Client Mutation
export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      console.log('Creating client with FormData');
      // Implement real create if needed
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

// Delete Client Mutation (the missing one)
export function useDeleteClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (clientId: string) => {
      console.log('Deleting client:', clientId);
      // Implement real delete if needed
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}
