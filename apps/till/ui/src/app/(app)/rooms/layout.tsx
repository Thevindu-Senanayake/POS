'use client';

import type { ReactNode } from 'react';
import { FullscreenSpinner, useAuthStore } from '@pos/client-core';

/** Hold the Rooms workspace until the persisted session has hydrated. */
export default function RoomsLayout({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);

  if (!role) return <FullscreenSpinner label="Loading…" />;

  return <>{children}</>;
}
