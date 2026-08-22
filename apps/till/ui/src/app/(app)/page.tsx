'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { FullscreenSpinner, useAuthStore } from '@pos/client-core';

/**
 * Authenticated landing for the till: always open the POS workspace once a
 * session exists. Login already blocks admin accounts from the till, so the
 * only destination here is `/pos`.
 */
export default function HomePage() {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);

  useEffect(() => {
    if (role) router.replace('/pos');
  }, [role, router]);

  return <FullscreenSpinner label={role ? 'Opening your workspace…' : 'Loading…'} />;
}
