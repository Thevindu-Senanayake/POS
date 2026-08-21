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
