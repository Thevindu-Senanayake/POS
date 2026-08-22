'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { FullscreenSpinner, useAuthStore } from '@pos/client-core';
import { AdminNav } from '@/features/admin/admin-nav';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const allowed = role === 'admin';

  useEffect(() => {
    if (role && !allowed) {
      router.replace('/login');
    }
  }, [role, allowed, router]);

  if (!role) return <FullscreenSpinner label="Loading…" />;
  if (!allowed) return <FullscreenSpinner label="Redirecting…" />;

  return (
    <div>
      <AdminNav />
      {children}
    </div>
  );
}
