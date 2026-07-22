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

/** Normalize getClients() which returns either an array or `{ clients: [] }`. */
function normalizeClientsList(allData: unknown): any[] {
  let list: any[] = [];
  if (Array.isArray(allData)) list = allData;
  else if (
    allData &&
    typeof allData === 'object' &&
    Array.isArray((allData as any).clients)
  ) {
    list = (allData as any).clients;
  }
  // Ensure contacts[] is always an array so hiring-manager pickers work
  return list.map((c) =>
    c && typeof c === 'object'
      ? { ...c, contacts: Array.isArray(c.contacts) ? c.contacts : [] }
      : c
  );
}

// Clients Query (for list pages) — always returns a client array
export function useClients() {
  return useQuery({
    queryKey: clientKeys.lists(),
    queryFn: async () => {
      const allData = await getClients();
      return normalizeClientsList(allData);
    },
    staleTime: 0,
    // Always re-check after AI / other tabs mutate Dynamo
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

// Single Client (for detail pages)
export function useClient(clientId: string) {
  return useQuery({
    queryKey: clientKeys.detail(clientId),
    queryFn: async () => {
      const companies = normalizeClientsList(await getClients());

      const found = companies.find(
        (c: any) =>
          String(c.id) === String(clientId) ||
          String(c.PK) === String(clientId) ||
          String(c.companyId) === String(clientId)
      );

      // Always return a stable object shape so contact pickers can read contacts[]
      if (!found) return null;
      return {
        ...found,
        contacts: Array.isArray(found.contacts) ? found.contacts : [],
      };
    },
    enabled: !!clientId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
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
  if (obj.open_jobs_posted != null && obj.open_jobs_posted !== '') {
    const n = Number(obj.open_jobs_posted);
    if (!Number.isNaN(n) && n >= 0) obj.open_jobs_posted = n;
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
        phone: payload.phone ? String(payload.phone) : undefined,
        domain: payload.domain ? String(payload.domain) : undefined,
        industry: payload.industry ? String(payload.industry) : undefined,
        city: payload.city ? String(payload.city) : undefined,
        state: payload.state ? String(payload.state) : undefined,
        country: payload.country ? String(payload.country) : undefined,
        employee_count:
          typeof payload.employee_count === 'number'
            ? payload.employee_count
            : undefined,
        company_size: payload.company_size
          ? String(payload.company_size)
          : undefined,
        open_jobs_posted:
          typeof payload.open_jobs_posted === 'number'
            ? payload.open_jobs_posted
            : undefined,
        revenue: payload.revenue ? String(payload.revenue) : undefined,
        description: payload.description ? String(payload.description) : undefined,
        linkedin_url: payload.linkedin_url
          ? String(payload.linkedin_url)
          : undefined,
        status: payload.status ? String(payload.status) : undefined,
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
