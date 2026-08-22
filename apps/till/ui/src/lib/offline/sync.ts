'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { OrderDTO } from '@pos/shared';
import { ApiError, api } from '@pos/client-core';
import { qk } from '@pos/client-core';
import { getOfflineDb, type QueuedSend } from './db';
import { useOfflineStore } from './store';

/** Fields a caller supplies when queuing a round; the engine stamps id/createdAt/attempts. */
export type EnqueueInput = Omit<QueuedSend, 'id' | 'createdAt' | 'attempts'>;

/** Re-project the durable outbox (oldest-first) into the reactive store. */
export async function refreshOutbox(): Promise<void> {
  const db = getOfflineDb();
  if (!db) return;
  const entries = await db.outbox.orderBy('createdAt').toArray();
  useOfflineStore.getState().setEntries(entries);
}

/** Durably queue a send round and reflect it in the UI. Returns the new entry id. */
export async function enqueueSend(input: EnqueueInput): Promise<string | null> {
  const db = getOfflineDb();
  if (!db) return null;
  const entry: QueuedSend = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    attempts: 0,
  };
  await db.outbox.add(entry);
  await refreshOutbox();
  return entry.id;
}

/** Drop a queued entry (user discard, or after it succeeds). */
export async function discardEntry(id: string): Promise<void> {
  const db = getOfflineDb();
  if (!db) return;
  await db.outbox.delete(id);
  await refreshOutbox();
}

/**
 * Replay the outbox oldest-first (spec §9). For each entry it ensures the order
 * exists (creating it once per `cartKey` so multiple offline rounds for one new
 * table don't spawn duplicate orders), pushes any items, then fires the kitchen
 * — the send is what deducts stock and prints the KOT, server-side, only now.
 *
 * Failure handling:
 *  - **Network error** (unreachable): mark offline and stop; retry the whole
 *    queue on the next tick, preserving order.
 *  - **Server rejection** (`ApiError`): the entry can't succeed as-is; record
 *    the error + bump attempts and skip past it so one poisoned round can't
 *    wedge the queue. It surfaces in the indicator for manual retry/discard.
 *
 * Concurrent calls are coalesced via the `syncing` flag.
 */
export async function flushOutbox(qc: QueryClient): Promise<void> {
  const store = useOfflineStore.getState();
  if (store.syncing) return;

  const db = getOfflineDb();
  if (!db) return;

  const entries = await db.outbox.orderBy('createdAt').toArray();
  if (entries.length === 0) {
    store.setOnline(true);
    return;
  }

  store.setSyncing(true);
  store.setLastError(null);
  // Orders created during *this* pass, so later rounds for the same new table
  // attach to the same order instead of creating a second one.
  const createdForCart = new Map<string, string>();
  let touchedBoards = false;

  try {
    for (const entry of entries) {
      try {
        let orderId = entry.orderId ?? createdForCart.get(entry.cartKey) ?? null;

        if (entry.items.length > 0) {
          if (!orderId) {
            const created = await api.post<OrderDTO>('/orders', {
              channel: entry.channel,
              tableSessionId: entry.tableSessionId,
              items: entry.items,
            });
            orderId = created.id;
            createdForCart.set(entry.cartKey, orderId);
            qc.setQueryData(qk.order(orderId), created);
          } else {
            const updated = await api.post<OrderDTO>(`/orders/${orderId}/items`, {
              items: entry.items,
            });
            qc.setQueryData(qk.order(orderId), updated);
          }
        }

        if (orderId) {
          // Sweep every draft line to the kitchen/bar — this is the point stock
          // is deducted and the KOT is enqueued, server-side.
          const sent = await api.post<OrderDTO>(`/orders/${orderId}/send`, {});
          qc.setQueryData(qk.order(orderId), sent);
        }

        await db.outbox.delete(entry.id);
        touchedBoards = true;
        store.setOnline(true);
      } catch (e) {
        if (e instanceof ApiError) {
          // Genuine rejection — flag it and move on so it can't block the queue.
          await db.outbox.update(entry.id, {
            attempts: entry.attempts + 1,
            lastError: e.message,
          });
          store.setLastError(e.message);
          continue;
        }
        // Network failure — we're offline again; stop and retry the queue later.
        store.setOnline(false);
        break;
      }
    }
  } finally {
    store.setSyncing(false);
    await refreshOutbox();
    if (touchedBoards) {
      void qc.invalidateQueries({ queryKey: qk.tables });
      void qc.invalidateQueries({ queryKey: qk.sessions });
    }
  }
}
