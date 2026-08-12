"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { subscribeCrmCacheBroadcast } from "@/lib/hooks/invalidate-crm-cache";
import { OpsTelemetry } from "@/components/ops/OpsTelemetry";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Immediate-UI convention: treat CRM data as fresh-on-read.
            // Mutations call refreshCrmUi / invalidate with refetchType active so
            // mounted screens update right away (no multi-second stale lag).
            staleTime: 0,
            // Re-read when navigating back to a screen after a write
            refetchOnMount: "always",
            // Still avoid noisy focus storms during rapid multi-tab work
            refetchOnWindowFocus: false,
          },
          mutations: {
            // Failures surface via each mutation's onError toast
            retry: 0,
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
      <OpsTelemetry />
      <Toaster />
    </QueryClientProvider>
  );
}
