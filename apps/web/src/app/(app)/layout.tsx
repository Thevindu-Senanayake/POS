import type { ReactNode } from 'react';
import { AuthGate } from '@/components/auth/auth-gate';
import { AppShell } from '@/components/layout/app-shell';

/** Layout for the authenticated app: guard first, then the shell chrome. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
