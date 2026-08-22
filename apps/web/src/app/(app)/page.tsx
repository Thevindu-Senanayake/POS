'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { FullscreenSpinner, useAuthStore } from '@pos/client-core';

/**
 * Authenticated landing for the Web Management Portal: always open the Admin
 * workspace once a session exists. Login already blocks non-admins, so the only
 * destination here is `/admin`.
 */
export default function HomePage() {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);

  useEffect(() => {
    if (role) router.replace('/admin');
  }, [role, router]);

  return <FullscreenSpinner label={role ? 'Opening your workspace…' : 'Loading…'} />;
}
