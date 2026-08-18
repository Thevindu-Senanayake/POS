import type { Channel, Station } from './enums.js';

/**
 * Payloads for the realtime (socket.io) events named in {@link WS_EVENTS}
 * (see index.ts). The board-invalidation events (`tables:updated`,
 * `rooms:updated`) carry no data — clients refetch the relevant board — while
 * the events below carry the detail a live screen needs to react immediately.
 */

/** `kot:created` — one per distinct station when an order is sent (spec §2.6/§3). */
export interface KotCreatedEvent {
  orderId: string;
  channel: Channel;
  station: Station;
  /** Table name for dine-in orders; null for room-service/takeaway. */
  tableName: string | null;
  items: { name: string; qty: number; notes: string | null }[];
}

/** `printer:health` — a printer's reachability changed (spec §3.3, emitted by printing). */
export interface PrinterHealthEvent {
  printerId: string;
  name: string;
  online: boolean;
  lastError: string | null;
}

/** `stock:low` — an ingredient crossed its reorder level after a deduction (spec §2.8). */
export interface LowStockEvent {
  ingredientId: string;
  name: string;
  currentStock: number;
  reorderLevel: number;
  unit: string;
}
