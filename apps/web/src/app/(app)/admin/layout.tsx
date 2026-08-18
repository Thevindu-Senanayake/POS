'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { canPerform } from '@pos/shared';
import { FullscreenSpinner } from '@/components/ui/spinner';
import { AdminNav } from '@/features/admin/admin-nav';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Admin area shell (spec §5/§7): gates the whole `/admin/*` tree on the
 * `view_admin` permission (admin-only in the matrix) and renders the section
 * sub-navigation above each workspace. Non-admins are bounced to the POS.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const allowed = role ? canPerform('view_admin', role) : false;

  useEffect(() => {
    if (role && !allowed) router.replace('/pos');
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
