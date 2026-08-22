'use client';

import Link from 'next/link';
import { formatMoney } from '@pos/shared';
import { FullscreenSpinner } from '@pos/client-core';
import { useDashboard, useLowStock } from './api';
import { BASE_UNIT_SHORT } from './format';
import { AdminPage, SectionCard, StatCard, Table } from './ui';

/**
 * Admin home (spec §5): a live snapshot of the venue — occupancy, open orders,
 * today's sales, and the two operational alarms (low stock, offline printers) —
 * with quick links to the workspaces that resolve them. Auto-refreshes every
 * 30s and reacts to realtime stock/printer events via the shared query cache.
 */
export function Dashboard() {
  const summary = useDashboard();
  const lowStock = useLowStock();

  if (summary.isLoading) return <FullscreenSpinner label="Loading dashboard…" />;
  if (summary.isError || !summary.data) {
    return (
      <AdminPage title="Dashboard">
        <SectionCard>
          <div className="px-4 py-10 text-center text-slate-500">
            Could not load the dashboard. Is the API running?
          </div>
        </SectionCard>
      </AdminPage>
    );
  }

  const s = summary.data;

  return (
    <AdminPage title="Dashboard" subtitle="Live snapshot of the floor, rooms and inventory.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Sales today" value={formatMoney(s.salesToday)} tone="brand" />
        <StatCard label="Open orders" value={s.openOrders} hint="Sent, served or awaiting bill" />
        <StatCard
          label="Tables"
          value={`${s.tablesOccupied} / ${s.tablesOccupied + s.tablesFree}`}
          hint={`${s.tablesFree} free`}
        />
        <StatCard
          label="Rooms"
          value={`${s.roomsOccupied} / ${s.roomsOccupied + s.roomsVacant}`}
          hint={`${s.roomsVacant} vacant`}
        />
        <StatCard
          label="Low stock"
          value={s.lowStockCount}
          tone={s.lowStockCount > 0 ? 'warn' : 'ok'}
          hint={s.lowStockCount > 0 ? 'At or below reorder level' : 'All above reorder level'}
        />
        <StatCard
          label="Printers offline"
          value={s.printersOffline}
          tone={s.printersOffline > 0 ? 'danger' : 'ok'}
          hint={s.printersOffline > 0 ? 'Needs attention' : 'All reachable'}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Low-stock alerts"
          description="Ingredients at or below their reorder level."
          actions={
            <Link href="/admin/inventory" className="text-sm font-semibold text-brand-700 hover:underline">
              Manage inventory →
            </Link>
          }
        >
          {lowStock.isLoading ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">Loading…</div>
          ) : (
            <Table
              rows={lowStock.data ?? []}
              keyOf={(r) => r.ingredientId}
              empty="Nothing below reorder level. 🎉"
              columns={[
                { header: 'Ingredient', cell: (r) => <span className="font-semibold">{r.ingredientName}</span> },
                {
                  header: 'In stock',
                  align: 'right',
                  cell: (r) => `${r.currentStock.toLocaleString('en-US')} ${BASE_UNIT_SHORT[r.baseUnit]}`,
                },
                {
                  header: 'Reorder at',
                  align: 'right',
                  cell: (r) => `${r.reorderLevel.toLocaleString('en-US')} ${BASE_UNIT_SHORT[r.baseUnit]}`,
                },
                {
                  header: 'Short by',
                  align: 'right',
                  cell: (r) => (
                    <span className="font-bold text-amber-600">
                      {r.shortfall.toLocaleString('en-US')} {BASE_UNIT_SHORT[r.baseUnit]}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </SectionCard>

        <SectionCard title="Quick links" description="Jump to a workspace.">
          <div className="grid grid-cols-2 gap-2 p-4">
            {[
              { href: '/admin/reports', label: 'Sales & reports' },
              { href: '/admin/purchasing', label: 'Receive goods' },
              { href: '/admin/menu', label: 'Menu & recipes' },
              { href: '/admin/rooms', label: 'Rooms & rates' },
              { href: '/admin/printers', label: 'Printer health' },
              { href: '/admin/users', label: 'Users & roles' },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-xl border border-sand-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:border-brand-300 hover:bg-brand-50"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>
    </AdminPage>
  );
}
