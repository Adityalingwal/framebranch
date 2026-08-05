"use client";

/**
 * providers.tsx — the one TanStack Query client for the app (M8 lock 4).
 *
 * GET queries get a small, bounded retry (network hiccups on read paths are
 * not spec'd by C6 — C6 is explicitly about mutations — so this is the
 * smallest reasonable default, not a re-litigation of the lock). Mutations
 * NEVER use react-query's own retry: the C6 retry ladder lives in
 * src/lib/api-client.ts and is driven by the mutation hooks themselves, so
 * this client turns react-query's mutation retry off to avoid a second,
 * uncoordinated retry mechanism stacking on top of it.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { ToastHost } from "../ui/ToastHost";
import { ConnectionBanner } from "../ui/ConnectionBanner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 5_000,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <ConnectionBanner />
      {children}
      <ToastHost />
    </QueryClientProvider>
  );
}
