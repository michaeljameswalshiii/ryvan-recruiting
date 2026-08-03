"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { subscribeCrmCacheBroadcast } from "@/lib/hooks/invalidate-crm-cache";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Cache briefly so sidebar navigation can paint instantly from memory.
            // AI/server mutations still call invalidateCrmCaches (marks stale +
            // refetches only *active* queries) so lists stay correct without a
            // full refetch storm after every AI write.
            staleTime: 30_000,
            // Avoid surprise refetch mid-click when tab regains focus
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  useEffect(() => {
    return subscribeCrmCacheBroadcast(queryClient);
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
