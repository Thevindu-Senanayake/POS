'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import type { UserRole } from '@pos/shared';
import { api, Button, RealtimeIndicator, useAuthStore } from '@pos/client-core';

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

  const logout = async () => {
    try {
      if (refreshToken) await api.post('/auth/logout', { refreshToken }, { auth: false });
    } catch {
      /* best-effort — clear locally regardless */
    }
    clear();
    router.replace('/login');
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-sand-200 bg-sand-50/80 px-4 shadow-sm backdrop-blur-md">
        {/* Gold hairline along the bottom edge of the header. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-accent-gradient opacity-70" />
        <Link href="/" className="flex items-center gap-2.5">
          <span className="logo-mark h-9 w-9 text-base">G</span>
          <span className="text-lg font-extrabold tracking-tight text-gradient">Grand Admin</span>
          <span className="rounded-full bg-brand-gradient px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
            Management Portal
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-3">
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
