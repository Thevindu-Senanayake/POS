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

/**
 * Operational POS nav — the day-to-day terminal (order-taking + rooms). Admin /
 * back-office is deliberately kept OUT of this list: it's a separate workspace
 * reached from a distinct entry on the right and rendered with its own chrome
 * under `/admin`, so the operator view isn't cluttered with owner-only tools.
 */
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

/** Authenticated layout chrome: brand, role-filtered nav, current user + sign-out. */
export function AppShell({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clear = useAuthStore((s) => s.clear);
  const router = useRouter();
  const pathname = usePathname();
  const role = user?.role;
  // Admin/back-office is its own view: when inside `/admin/*` we swap the
  // operational tabs for back-office chrome, and elsewhere we expose admin only
  // as a separated, admin-only entry (never as a peer of the POS/Rooms tabs).
  const inAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const canAdmin = role ? canPerform('view_admin', role) : false;

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
          <span className="text-lg font-extrabold tracking-tight text-gradient">Grand&nbsp;POS</span>
          {inAdmin ? (
            <span className="rounded-full bg-brand-gradient px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
              Back office
            </span>
          ) : null}
        </Link>

        {inAdmin ? (
          // Back-office chrome: no operational tabs, just a way into the POS.
          <Link
            href="/pos"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-sand-200/70"
          >
            Open POS →
          </Link>
        ) : (
          // Operational chrome: POS / Rooms only.
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
        )}
        <div className="ml-auto flex items-center gap-3">
          {!inAdmin && canAdmin ? (
            // Admin is separated from the operational tabs: a distinct, admin-only
            // back-office entry set apart on the right, not a peer of POS/Rooms.
            <Link
              href="/admin"
              className="rounded-lg border border-sand-300 bg-white/70 px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:border-brand-300 hover:bg-white hover:text-brand-700"
            >
              ⚙ Back office
            </Link>
          ) : null}
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
