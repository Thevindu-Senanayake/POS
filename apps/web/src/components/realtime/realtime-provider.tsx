'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { WS_EVENTS, type OrderDTO } from '@pos/shared';
import { WS_URL } from '@/lib/env';
import { qk } from '@/lib/query-keys';
import { useAuthStore } from '@/stores/auth-store';

interface RealtimeContextValue {
  connected: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue>({ connected: false });

/** Read the live socket connection status (drives the header indicator). */
export function useRealtime(): RealtimeContextValue {
  return useContext(RealtimeContext);
}

/**
 * Owns the socket.io connection for the authenticated app. On every server
 * broadcast it nudges the relevant TanStack Query caches so open screens —
 * floor board, order ticket, room board — reflect other terminals' actions
 * live (spec §1/§5). The connection is keyed on the access token so a token
 * refresh transparently reconnects with fresh credentials.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      setConnected(false);
      return;
    }

    const socket: Socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    // The gateway emits this then disconnects when the token is rejected.
    socket.on('unauthorized', () => setConnected(false));

    // Board-invalidation events carry no payload — refetch the affected board.
    socket.on(WS_EVENTS.tablesUpdated, () => {
      void qc.invalidateQueries({ queryKey: qk.tables });
      void qc.invalidateQueries({ queryKey: qk.sessions });
    });
    socket.on(WS_EVENTS.roomsUpdated, () => {
      void qc.invalidateQueries({ queryKey: qk.rooms });
      void qc.invalidateQueries({ queryKey: ['bookings'] });
    });
    // Order events carry the full DTO — write it straight into the cache so the
    // ticket updates without a refetch round-trip.
    socket.on(WS_EVENTS.orderUpdated, (order: OrderDTO) => {
      if (order?.id) qc.setQueryData(qk.order(order.id), order);
    });
    // KOT creation is already accompanied by an order:updated for the POS; the
    // dedicated KDS (later) is the primary consumer of this event.
    socket.on(WS_EVENTS.printerHealth, () => {
      void qc.invalidateQueries({ queryKey: qk.printers });
    });
    socket.on(WS_EVENTS.lowStock, () => {
      void qc.invalidateQueries({ queryKey: qk.ingredients });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [token, qc]);

  return <RealtimeContext.Provider value={{ connected }}>{children}</RealtimeContext.Provider>;
}
