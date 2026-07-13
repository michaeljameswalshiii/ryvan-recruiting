'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getClients, addContactAction } from '@/lib/actions/client-actions';

export const clientKeys = {
  all: ['clients'] as const,
  lists: () => [...clientKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...clientKeys.lists(), { filters }] as const,
  details: () => [...clientKeys.all, 'detail'] as const,
  detail: (id: string) => [...clientKeys.details(), id] as const,
};

// Clients Query (for list pages)
export function useClients() {
  return useQuery({
    queryKey: clientKeys.lists(),
    queryFn: getClients,
  });
}

// Single Client (for detail pages)
export function useClient(clientId: string) {
  return useQuery({
    queryKey: clientKeys.detail(clientId),
    queryFn: async () => {
      console.log('Fetching single client:', clientId);

      const allData = await getClients();
      const companies = Array.isArray(allData) ? allData : allData?.clients || [];

      const found = companies.find(
        (c: any) => String(c.id) === String(clientId) || String(c.PK) === String(clientId)
      );

      console.log('Found company:', found ? found.name : 'Not found');
      return found || null;
    },
    enabled: !!clientId,
  });
}

// Create Client (placeholder)
export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (_formData: FormData) => {
      console.log('Creating client');
      return { success: true };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientKeys.all }),
  });
}

// Delete Client (placeholder)
export function useDeleteClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (clientId: string) => {
      console.log('Deleting client:', clientId);
      return { success: true };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientKeys.all }),
  });
}

// Re-export add for convenience
export { addContactAction };
