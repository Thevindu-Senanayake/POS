'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { canPerform, type Permission, type UserRole } from '@pos/shared';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { RealtimeIndicator } from '@/components/realtime/realtime-indicator';
import { SyncIndicator } from '@/components/realtime/sync-indicator';
import { useAuthStore } from '@/stores/auth-store';

const NAV: { href: string; label: string; perm: Permission }[] = [
  { href: '/pos', label: 'POS', perm: 'take_orders' },
  { href: '/rooms', label: 'Rooms', perm: 'take_orders' },
  { href: '/admin', label: 'Admin', perm: 'view_admin' },
];

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  cashier: 'Cashier',
  waiter: 'Waiter',
  bartender: 'Bartender',
  kitchen_staff: 'Kitchen',
  room_service_staff: 'Room Service',
};

/** Authenticated layout chrome: brand, role-filtered nav, current user + sign-out. */
export function AppShell({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clear = useAuthStore((s) => s.clear);
  const router = useRouter();
  const pathname = usePathname();
  const role = user?.role;

  const logout = async () => {
    try {
      if (refreshToken) await api.post('/auth/logout', { refreshToken }, { auth: false });
    } catch {
      /* best-effort — clear locally regardless */
    }
    clear();
    router.replace('/login');
  };

  const nav = NAV.filter((n) => role && canPerform(n.perm, role));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-slate-200 bg-white px-4 shadow-sm">
        <Link href="/" className="text-lg font-extrabold tracking-tight text-brand-700">
          Grand&nbsp;POS
        </Link>
        <nav className="flex items-center gap-1">
          {nav.map((n) => {
            const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                  active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <SyncIndicator />
          <RealtimeIndicator />
          {user ? (
            <div className="text-right leading-tight">
              <div className="text-sm font-semibold text-slate-800">{user.name}</div>
              <div className="text-xs text-slate-500">{ROLE_LABELS[user.role] ?? user.role}</div>
            </div>
          ) : null}
          <Button variant="secondary" onClick={logout}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
