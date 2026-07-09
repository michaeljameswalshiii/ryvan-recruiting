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
    staleTime: 1000 * 60 * 10,      // 10 minutes
    gcTime: 1000 * 60 * 15,         // 15 minutes
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnMount: false,          // Prevent auto-refetch on mount
    refetchOnReconnect: false,
  });
}
