/**
 * Shared React Query keys for clients/companies.
 * Kept separate so mutation hooks and query hooks can share them without circular imports.
 */

export const clientKeys = {
  all: ['clients'] as const,
  lists: () => [...clientKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) =>
    [...clientKeys.lists(), { filters }] as const,
  details: () => [...clientKeys.all, 'detail'] as const,
  detail: (id: string) => [...clientKeys.details(), id] as const,
};
