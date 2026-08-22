'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@pos/client-core';

/**
 * Admin section sub-navigation (spec §5). Every admin workspace lives under
 * `/admin/*`; this horizontal, scrollable tab bar switches between them. The
 * dashboard is the index route so its tab matches `/admin` exactly, while the
 * others match their prefix.
 */
export const ADMIN_SECTIONS: { href: string; label: string }[] = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/inventory', label: 'Inventory' },
  { href: '/admin/purchasing', label: 'Purchasing' },
  { href: '/admin/menu', label: 'Menu & Recipes' },
  { href: '/admin/rooms', label: 'Rooms' },
  { href: '/admin/tables', label: 'Tables' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/printers', label: 'Printers' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/business', label: 'Business' },
  { href: '/admin/settings', label: 'Settings' },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <div className="border-b border-sand-200 bg-sand-50/70 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2 sm:px-6">
        {ADMIN_SECTIONS.map((s) => {
          const active = s.href === '/admin' ? pathname === '/admin' : pathname.startsWith(s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              className={cn(
                'whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                active
                  ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-100 shadow-sm'
                  : 'text-slate-600 hover:bg-sand-100',
              )}
            >
              {s.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
