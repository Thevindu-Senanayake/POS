'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { canPerform, type Permission, type UserRole } from '@pos/shared';
import { api, cn, Button, RealtimeIndicator, useAuthStore } from '@pos/client-core';
import { SyncIndicator } from '@/components/realtime/sync-indicator';

const NAV: { href: string; label: string; perm: Permission }[] = [
  { href: '/pos', label: 'POS', perm: 'take_orders' },
  { href: '/rooms', label: 'Rooms', perm: 'take_orders' },
];

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  cashier: 'Cashier',
  waiter: 'Waiter',
  bartender: 'Bartender',
  kitchen_staff: 'Kitchen',
  room_service_staff: 'Room Service',
};

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
      <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-sand-200 bg-sand-50/80 px-4 shadow-sm backdrop-blur-md">
        {/* Gold hairline along the bottom edge of the header. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-accent-gradient opacity-70" />
        <Link href="/" className="flex items-center gap-2.5">
          <span className="logo-mark h-9 w-9 text-base">G</span>
          <span className="text-lg font-extrabold tracking-tight text-gradient">Grand POS</span>
        </Link>

        {/* Operational POS chrome: POS / Rooms tabs. */}
        <nav className="flex items-center gap-1">
          {nav.map((n) => {
            const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                  active
                    ? 'bg-brand-100 text-brand-800 shadow-sm ring-1 ring-brand-200'
                    : 'text-slate-600 hover:bg-sand-200/70',
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
              <div className="text-xs font-medium text-brand-700">{ROLE_LABELS[user.role] ?? user.role}</div>
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
