'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { FullscreenSpinner } from '@/components/ui/spinner';

/**
 * Client-side route guard for the authenticated section. Waits for the persisted
 * auth store to hydrate before deciding, so a page refresh doesn't flash-redirect
 * a logged-in user to /login.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const token = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (hydrated && !token) router.replace('/login');
  }, [hydrated, token, router]);

  if (!hydrated) return <FullscreenSpinner label="Loading…" />;
  if (!token) return <FullscreenSpinner label="Redirecting to sign in…" />;
  return <>{children}</>;
}
