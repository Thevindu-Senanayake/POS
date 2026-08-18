import type { ReactNode } from 'react';
import { AuthGate } from '@/components/auth/auth-gate';
import { AppShell } from '@/components/layout/app-shell';
import { RealtimeProvider } from '@/components/realtime/realtime-provider';

/** Layout for the authenticated app: guard first, then realtime + shell chrome. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <RealtimeProvider>
        <AppShell>{children}</AppShell>
      </RealtimeProvider>
    </AuthGate>
  );
}
