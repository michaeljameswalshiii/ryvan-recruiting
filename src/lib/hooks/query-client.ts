'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getClients, addContactAction } from '@/lib/actions/client-actions';

// Clients Query (for list pages)
export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: getClients,
  });
}

// Single Client (for detail pages) - FIXED
export function useClient(clientId: string) {
  return useQuery({
    queryKey: ['client', clientId],
    queryFn: async () => {
      console.log('Fetching single client:', clientId);
      
      // Reuse the existing getClients action and find by ID
      const allData = await getClients();
      const companies = Array.isArray(allData) 
        ? allData 
        : (allData?.clients || []);
      
      const found = companies.find((c: any) => 
        String(c.id) === String(clientId) || 
        String(c.PK) === String(clientId)
      );
      
      console.log('Found company:', found ? found.name : 'Not found');
      return found || null;
    },
    enabled: !!clientId,
  });
}

// Create Client
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

// Delete Client
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
