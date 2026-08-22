import type { ReactNode } from 'react';
import { AuthGate, RealtimeProvider } from '@pos/client-core';
import { AppShell } from '@/components/layout/app-shell';
import { SyncProvider } from '@/lib/offline/sync-provider';

/**
 * Layout for the authenticated till: guard first, then realtime, then the
 * offline-sync engine (nested inside realtime so it can drain the queue on
 * socket reconnect), then the shell chrome.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <RealtimeProvider>
        <SyncProvider>
          <AppShell>{children}</AppShell>
        </SyncProvider>
      </RealtimeProvider>
    </AuthGate>
  );
}
