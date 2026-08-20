'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { canPerform } from '@pos/shared';
import { FullscreenSpinner } from '@/components/ui/spinner';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Authenticated landing: send each role straight to its home workspace instead
 * of a picker. Admins land in the back office (`/admin`) — from there they can
 * step into the POS if they need to — and everyone else lands in the POS.
 * Access to `/admin` is still enforced by the admin layout + API guards; this
 * only decides where you *start*.
 */
export default function HomePage() {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);

  const target = role
    ? canPerform('view_admin', role)
      ? '/admin'
      : canPerform('take_orders', role)
        ? '/pos'
        : null
    : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (!role) return <FullscreenSpinner label="Loading…" />;
  if (target) return <FullscreenSpinner label="Opening your workspace…" />;

  // Roles with neither admin nor ordering access have no workspace wired up yet.
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <h1 className="mb-2 text-xl font-bold text-slate-900">No workspace available</h1>
      <p className="text-slate-500">
        Your role doesn’t have a workspace assigned yet. Ask an administrator for access.
      </p>
    </div>
  );
}
