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
            // Prefer fresh CRM data after AI/server mutations
            staleTime: 0,
            refetchOnWindowFocus: true,
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
