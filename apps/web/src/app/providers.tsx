'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ManagerPinProvider } from '@/components/manager-pin/pin-provider';

/** App-wide client providers: TanStack Query cache + the manager-PIN modal. */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 10_000 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ManagerPinProvider>{children}</ManagerPinProvider>
    </QueryClientProvider>
  );
}
