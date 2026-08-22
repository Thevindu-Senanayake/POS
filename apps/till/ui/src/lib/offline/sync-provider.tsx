'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { useRealtime } from '@pos/client-core';
import { flushOutbox, refreshOutbox } from '@/lib/offline/sync';
import { useOfflineStore } from '@/lib/offline/store';

/**
 * Drives the offline outbox (spec §9). It owns every trigger that can move the
 * queue forward and keeps the reactive store honest about connectivity:
 *  - on mount: load the durable queue and seed `online` from the browser;
 *  - browser `online`/`offline` events;
 *  - the realtime socket reconnecting (a strong "server reachable" signal);
 *  - a periodic safety-net poll for when the OS says online but the API blipped.
 *
 * All triggers funnel into {@link flushOutbox}, which coalesces overlapping
 * runs, so firing from several sources at once is safe.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { connected } = useRealtime();
  const setOnline = useOfflineStore((s) => s.setOnline);

  // Load the durable queue + seed connectivity, then attempt a first flush.
  useEffect(() => {
    void refreshOutbox();
    const online = typeof navigator === 'undefined' ? true : navigator.onLine;
    setOnline(online);
    if (online) void flushOutbox(qc);
  }, [qc, setOnline]);

  // The browser's own connectivity transitions.
  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void flushOutbox(qc);
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [qc, setOnline]);

  // Socket reconnect ⇒ the API is reachable again ⇒ drain the queue.
  useEffect(() => {
    if (connected) void flushOutbox(qc);
  }, [connected, qc]);

  // Safety net: retry anything still queued even without an explicit event.
  useEffect(() => {
    const timer = setInterval(() => {
      if (useOfflineStore.getState().entries.length > 0) void flushOutbox(qc);
    }, 8000);
    return () => clearInterval(timer);
  }, [qc]);

  return <>{children}</>;
}
