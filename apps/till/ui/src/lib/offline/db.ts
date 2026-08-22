'use client';

import Dexie, { type Table } from 'dexie';
import type { Channel } from '@pos/shared';
import type { OrderItemInput } from '@/features/pos/api';

/**
 * A durably-queued "send" round (spec §9). One row = one tap of **Send** that
 * could not reach the API. Replaying it hits the real `/orders` + `/send`
 * endpoints, so **stock deduction and KOT printing only ever happen once the
 * server accepts it** — never from this local draft.
 *
 * `items: []` with an `orderId` means "the items were already accepted by the
 * server but the send didn't land" — replay only needs to fire the kitchen.
 */
export interface QueuedSend {
  /** Client-generated id (uuid) — stable across retries. */
  id: string;
  /** Epoch ms; the queue always replays oldest-first to preserve round order. */
  createdAt: number;
  /** The originating screen key (`table:<id>` / `order:<id>`) — dedupes order creation. */
  cartKey: string;
  /** Human label for the indicator (e.g. the table name / channel). */
  label: string;
  channel: Channel;
  tableId?: string;
  tableSessionId?: string;
  /** Known server order id, if the order already existed when this was queued. */
  orderId?: string;
  items: OrderItemInput[];
  /** How many replay attempts have been made (drives retry/failed UI). */
  attempts: number;
  /** Last server rejection message, if the entry is stuck on a real error. */
  lastError?: string;
}

/** The IndexedDB database backing the offline outbox. */
export class OfflineDb extends Dexie {
  outbox!: Table<QueuedSend, string>;

  constructor() {
    super('pos-offline');
    // Indexed by id (pk), createdAt (replay order), cartKey (per-screen filter).
    this.version(1).stores({ outbox: 'id, createdAt, cartKey' });
  }
}

let db: OfflineDb | null = null;

/**
 * Lazily construct the Dexie instance in the browser only. Returns `null`
 * during SSR / prerender (no `indexedDB`), so every caller must null-check —
 * the offline queue is a purely client-side concern.
 */
export function getOfflineDb(): OfflineDb | null {
  if (typeof indexedDB === 'undefined') return null;
  db ??= new OfflineDb();
  return db;
}
