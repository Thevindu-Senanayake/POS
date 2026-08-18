'use client';

import Link from 'next/link';
import { canPerform, type Permission } from '@pos/shared';
import { useAuthStore } from '@/stores/auth-store';

const TILES: { href: string; label: string; description: string; perm: Permission }[] = [
  {
    href: '/pos',
    label: 'POS Terminal',
    description: 'Floor board, take orders, send to kitchen, bill & pay.',
    perm: 'take_orders',
  },
  {
    href: '/rooms',
    label: 'Room Service',
    description: 'Room status board and in-house guest folios.',
    perm: 'take_orders',
  },
  {
    href: '/admin',
    label: 'Admin',
    description: 'Reports, menu & pricing, inventory, users & settings.',
    perm: 'view_admin',
  },
];

export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const role = user?.role;
  const tiles = TILES.filter((t) => role && canPerform(t.perm, role));

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">
        Welcome{user ? `, ${user.name.split(' ')[0]}` : ''}
      </h1>
      <p className="mb-6 text-slate-500">Choose a workspace to get started.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md"
          >
            <div className="text-lg font-bold text-slate-900 group-hover:text-brand-700">{t.label}</div>
            <p className="mt-1 text-sm text-slate-500">{t.description}</p>
          </Link>
        ))}
        {tiles.length === 0 ? (
          <p className="text-slate-500">No workspaces are available for your role.</p>
        ) : null}
      </div>
    </div>
  );
}
