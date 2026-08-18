'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { discardEntry, flushOutbox } from '@/lib/offline/sync';
import { useOfflineStore } from '@/lib/offline/store';

/**
 * Offline-queue status for the app header (spec §9). Stays hidden when nothing
 * is queued (connection status is the {@link RealtimeIndicator}'s job); when a
 * round is waiting it shows a count and, on tap, a popover to retry now or
 * discard a stuck round. Complements — doesn't duplicate — the live pill.
 */
export function SyncIndicator() {
  const qc = useQueryClient();
  const entries = useOfflineStore((s) => s.entries);
  const syncing = useOfflineStore((s) => s.syncing);
  const online = useOfflineStore((s) => s.online);
  const [open, setOpen] = useState(false);

  const pending = entries.length;
  if (pending === 0 && !syncing) return null;

  const label = syncing ? 'Syncing…' : `${pending} queued`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
          syncing ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700',
        )}
        title={
          syncing
            ? 'Syncing queued orders with the server'
            : `${pending} order round${pending === 1 ? '' : 's'} queued offline — will send when reconnected`
        }
      >
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            syncing ? 'animate-pulse bg-sky-500' : 'bg-amber-500',
          )}
        />
        {label}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-800">Offline queue</h4>
              <button
                type="button"
                onClick={() => void flushOutbox(qc)}
                disabled={syncing}
                className="text-xs font-semibold text-brand-700 hover:underline disabled:opacity-50"
              >
                {syncing ? 'Syncing…' : 'Retry now'}
              </button>
            </div>
            <p className="mb-2 text-xs text-slate-500">
              {online
                ? 'Rounds sent while the server was unreachable. They deduct stock and print the KOT only once the server accepts them.'
                : 'You appear to be offline. Queued rounds will sync automatically when the connection returns.'}
            </p>
            {pending === 0 ? (
              <p className="py-3 text-center text-xs text-slate-400">Everything is synced.</p>
            ) : (
              <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
                {entries.map((e) => {
                  const count = e.items.reduce((n, i) => n + i.qty, 0);
                  return (
                    <li key={e.id} className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-800">{e.label}</div>
                          <div className="text-xs text-slate-500">
                            {count > 0 ? `${count} item${count === 1 ? '' : 's'}` : 'Send to kitchen'}
                            {e.attempts > 0 ? ` · ${e.attempts} attempt${e.attempts === 1 ? '' : 's'}` : ''}
                          </div>
                          {e.lastError ? (
                            <div className="mt-0.5 truncate text-xs font-medium text-red-600" title={e.lastError}>
                              {e.lastError}
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => void discardEntry(e.id)}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-slate-100 hover:text-red-600"
                        >
                          Discard
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
