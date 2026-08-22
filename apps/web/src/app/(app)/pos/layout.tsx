'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { FullscreenSpinner } from '@/components/ui/spinner';
import { getAppMode } from '@/lib/app-mode';
import { useAuthStore } from '@/stores/auth-store';

export default function PosLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const mode = getAppMode();

  useEffect(() => {
    if (mode === 'admin') {
      router.replace('/admin');
    }
  }, [mode, router]);

  if (mode === 'admin') return <FullscreenSpinner label="Redirecting to Admin Portal…" />;
  if (!role) return <FullscreenSpinner label="Loading…" />;

  return <>{children}</>;
}
