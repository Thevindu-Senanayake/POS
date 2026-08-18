import type { ReactNode } from 'react';
import { AuthGate } from '@/components/auth/auth-gate';
import { AppShell } from '@/components/layout/app-shell';
import { RealtimeProvider } from '@/components/realtime/realtime-provider';
import { SyncProvider } from '@/lib/offline/sync-provider';

/**
 * Layout for the authenticated app: guard first, then realtime, then the
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
