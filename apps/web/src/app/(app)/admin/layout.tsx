'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { canPerform } from '@pos/shared';
import { FullscreenSpinner } from '@/components/ui/spinner';
import { getAppMode } from '@/lib/app-mode';
import { AdminNav } from '@/features/admin/admin-nav';
import { useAuthStore } from '@/stores/auth-store';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const mode = getAppMode();
  const allowed = role === 'admin' && mode === 'admin';

  useEffect(() => {
    if (mode === 'pos') {
      router.replace('/pos');
      return;
    }
    if (role && !allowed) {
      router.replace('/login');
    }
  }, [role, allowed, mode, router]);

  if (mode === 'pos') return <FullscreenSpinner label="Redirecting to POS…" />;
  if (!role) return <FullscreenSpinner label="Loading…" />;
  if (!allowed) return <FullscreenSpinner label="Redirecting…" />;

  return (
    <div>
      <AdminNav />
      {children}
    </div>
  );
}
