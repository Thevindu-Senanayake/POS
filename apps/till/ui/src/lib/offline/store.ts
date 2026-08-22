'use client';

import { create } from 'zustand';
import type { QueuedSend } from './db';

interface OfflineState {
  /** Mirror of the durable outbox, oldest-first. Kept in sync by the sync engine. */
  entries: QueuedSend[];
  /** Best-effort connectivity: window online/offline + demoted on a network error. */
  online: boolean;
  /** A replay pass is currently running. */
  syncing: boolean;
  /** Last server rejection surfaced during replay (a stuck entry), if any. */
  lastError: string | null;
  setEntries: (entries: QueuedSend[]) => void;
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  setLastError: (message: string | null) => void;
}

/**
 * Reactive view of the offline queue. The durable source of truth is Dexie
 * (see {@link getOfflineDb}); this store is the render-friendly projection the
 * header indicator and the order screen subscribe to. The sync engine writes
 * both, always re-projecting Dexie → `entries` after a mutation.
 *
 * `online` seeds to `true` so the very first send attempts the network rather
 * than queuing pre-emptively; it's corrected immediately by the SyncProvider's
 * `navigator.onLine` read on mount and by the outcome of real requests.
 */
export const useOfflineStore = create<OfflineState>((set) => ({
  entries: [],
  online: true,
  syncing: false,
  lastError: null,
  setEntries: (entries) => set({ entries }),
  setOnline: (online) => set({ online }),
  setSyncing: (syncing) => set({ syncing }),
  setLastError: (lastError) => set({ lastError }),
}));
