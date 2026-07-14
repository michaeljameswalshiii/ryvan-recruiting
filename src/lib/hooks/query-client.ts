'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getClients, addContactAction } from '@/lib/actions/client-actions';
import {
  createClient as createClientApi,
  updateClient as updateClientApi,
  deleteClient as deleteClientApi,
} from '@/lib/api/client-api';
import { clientKeys } from './client-keys';

export { clientKeys };

// Re-export contact mutations so existing imports from this module work
export {
  useAddContact,
  useUpdateContact,
  useRemoveContact,
} from './contact-mutations';

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
      const allData = await getClients();
      const companies = Array.isArray(allData) ? allData : allData?.clients || [];

      const found = companies.find(
        (c: any) =>
          String(c.id) === String(clientId) || String(c.PK) === String(clientId)
      );

      return found || null;
    },
    enabled: !!clientId,
  });
}

function formDataToObject(formData: FormData): Record<string, any> {
  const obj: Record<string, any> = {};
  formData.forEach((value, key) => {
    if (value === '' || value == null) return;
    obj[key] = value;
  });
  if (obj.employee_count != null && obj.employee_count !== '') {
    const n = Number(obj.employee_count);
    if (!Number.isNaN(n)) obj.employee_count = n;
  }
  return obj;
}

// Create Client
export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      const payload = formDataToObject(formData);
      if (!payload.name) {
        throw new Error('Company name is required');
      }
      return createClientApi({
        name: String(payload.name),
        email: payload.email ? String(payload.email) : undefined,
        domain: payload.domain ? String(payload.domain) : undefined,
        industry: payload.industry ? String(payload.industry) : undefined,
        city: payload.city ? String(payload.city) : undefined,
        state: payload.state ? String(payload.state) : undefined,
        country: payload.country ? String(payload.country) : undefined,
        employee_count:
          typeof payload.employee_count === 'number'
            ? payload.employee_count
            : undefined,
        revenue: payload.revenue ? String(payload.revenue) : undefined,
        description: payload.description ? String(payload.description) : undefined,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientKeys.all }),
  });
}

// Update Client
export function useUpdateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clientId,
      formData,
    }: {
      clientId: string;
      formData: FormData;
    }) => {
      const updates = formDataToObject(formData);
      return updateClientApi(clientId, updates);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: clientKeys.all });
      queryClient.invalidateQueries({
        queryKey: clientKeys.detail(variables.clientId),
      });
    },
  });
}

// Delete Client
export function useDeleteClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (clientId: string) => {
      await deleteClientApi(clientId);
      return { success: true };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientKeys.all }),
  });
}

// Re-export add for convenience
export { addContactAction };
