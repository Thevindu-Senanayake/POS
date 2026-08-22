import type { ReactNode } from 'react';
import { AuthGate, RealtimeProvider } from '@pos/client-core';
import { AppShell } from '@/components/layout/app-shell';

/**
 * Layout for the authenticated admin portal: guard first, then realtime (keeps
 * the admin dashboards live via cache invalidation), then the shell chrome.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <RealtimeProvider>
        <AppShell>{children}</AppShell>
      </RealtimeProvider>
    </AuthGate>
  );
}
