'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  useCleanTable,
  useCreateOrder,
  useTables,
} from './api';
import { AREA_LABELS, TABLE_STATUS_STYLES } from './format';
import type { DiningTableDTO, TableArea } from '@pos/shared';

const AREA_ORDER: TableArea[] = ['restaurant', 'bar'];

/**
 * Live floor board (spec §1): tables grouped by area, colour-coded by status,
 * updated in realtime via the socket `tables:updated` event. Tapping a free
 * table opens its order screen without seating it — the table only flips to
 * "occupied" on the first send there, so tapping a card to look never occupies
 * it; an occupied table resumes its order; a dirty table is cleaned in place.
 */
export function FloorBoard() {
  const router = useRouter();
  const tablesQuery = useTables();
  const cleanTable = useCleanTable();
  const createOrder = useCreateOrder();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const tables = tablesQuery.data ?? [];
    return AREA_ORDER.map((area) => ({
      area,
      tables: tables.filter((t) => t.area === area),
    })).filter((g) => g.tables.length > 0);
  }, [tablesQuery.data]);

  const openOrderScreen = (tableId: string) => router.push(`/pos/order?table=${tableId}`);

  const handleTable = async (table: DiningTableDTO) => {
    setError(null);
    if (table.status === 'occupied' || table.activeSessionId) {
      openOrderScreen(table.id);
      return;
    }
    if (table.status === 'needs_cleaning') {
      setBusyId(table.id);
      try {
        await cleanTable.mutateAsync(table.id);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not clean table');
      } finally {
        setBusyId(null);
      }
      return;
    }
    // free / reserved -> open the order screen WITHOUT seating the table. The
    // table only flips to "occupied" on the first send from the order screen;
    // tapping a card to look never occupies it.
    openOrderScreen(table.id);
  };

  const startTakeaway = async () => {
    setError(null);
    setBusyId('takeaway');
    try {
      const order = await createOrder.mutateAsync({ channel: 'takeaway' });
      router.push(`/pos/order?order=${order.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start a takeaway order');
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Floor</h1>
          <div className="mt-1 h-1 w-16 rounded-full bg-accent-gradient" />
          <p className="mt-2 text-sm text-slate-500">Tap a table to take or resume an order.</p>
        </div>
        <Button size="lg" onClick={startTakeaway} disabled={busyId === 'takeaway'}>
          {busyId === 'takeaway' ? <Spinner /> : '+ Takeaway'}
        </Button>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      {tablesQuery.isLoading ? (
        <div className="flex justify-center py-16 text-brand-500">
          <Spinner className="h-8 w-8" />
        </div>
      ) : tablesQuery.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load the floor. Check the API connection.
        </div>
      ) : grouped.length === 0 ? (
        <p className="py-16 text-center text-slate-400">No tables configured yet.</p>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ area, tables }) => (
            <section key={area}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">
                  {AREA_LABELS[area]}
                </h2>
                <span className="rounded-full bg-sand-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                  {tables.length}
                </span>
                <span className="h-px flex-1 bg-gradient-to-r from-accent-300/70 to-transparent" />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {tables.map((table) => (
                  <TableTile
                    key={table.id}
                    table={table}
                    busy={busyId === table.id}
                    onClick={() => handleTable(table)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Legend />
    </div>
  );
}

function TableTile({
  table,
  busy,
  onClick,
}: {
  table: DiningTableDTO;
  busy: boolean;
  onClick: () => void;
}) {
  const style = TABLE_STATUS_STYLES[table.status];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        'group relative flex min-h-[116px] flex-col justify-between rounded-2xl border p-3.5 text-left shadow-sm transition-all',
        'motion-safe:hover:-translate-y-0.5 hover:shadow-card-hover motion-safe:active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2',
        'disabled:cursor-wait disabled:opacity-70',
        style.tile,
      )}
    >
      <div className="flex w-full items-start justify-between">
        <span className="text-2xl leading-none" aria-hidden>
          {style.icon}
        </span>
        <span className={cn('mt-1 h-2.5 w-2.5 rounded-full ring-2 ring-white/80', style.dot)} />
      </div>
      <div>
        <div className="text-lg font-extrabold leading-tight">{table.name}</div>
        <div className="text-xs font-semibold opacity-80">
          {busy ? 'Working…' : style.label}
          {table.status === 'needs_cleaning' && !busy ? ' · tap to clear' : ''}
        </div>
      </div>
      <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold opacity-80">
        Seats {table.capacity}
      </span>
    </button>
  );
}

function Legend() {
  return (
    <div className="mt-8 flex flex-wrap gap-2 text-xs">
      {(['free', 'occupied', 'reserved', 'needs_cleaning'] as const).map((s) => (
        <span
          key={s}
          className="inline-flex items-center gap-1.5 rounded-full border border-sand-200 bg-white/70 px-2.5 py-1 font-medium text-slate-600"
        >
          <span className={cn('h-2.5 w-2.5 rounded-full', TABLE_STATUS_STYLES[s].dot)} />
          {TABLE_STATUS_STYLES[s].label}
        </span>
      ))}
    </div>
  );
}
