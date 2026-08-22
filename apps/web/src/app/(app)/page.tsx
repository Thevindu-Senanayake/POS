'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { FullscreenSpinner } from '@/components/ui/spinner';
import { getAppMode } from '@/lib/app-mode';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Authenticated landing: route by app mode — Admin portal → `/admin`, POS till → `/pos`.
 * Login already enforces that admins only sign into Admin mode and operational roles
 * only into POS mode, so the mode alone determines the correct workspace.
 */
export default function HomePage() {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);

  const target = role ? (getAppMode() === 'pos' ? '/pos' : '/admin') : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  return <FullscreenSpinner label={target ? 'Opening your workspace…' : 'Loading…'} />;
}
