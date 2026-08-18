'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Channel } from '@pos/shared';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { FullscreenSpinner } from '@/components/ui/spinner';
import {
  useAddItems,
  useCreateOrder,
  useOpenSession,
  useOrder,
  useSendToKitchen,
  useServiceCharges,
  useTable,
} from './api';
import { useCartStore, type CartLine } from './cart-store';
import { CHANNEL_LABELS, channelForArea } from './format';
import { MenuGrid } from './menu-grid';
import { OrderTicket } from './order-ticket';
import { PayDialog } from './pay-dialog';

const EMPTY_CART: CartLine[] = [];

/**
 * The order workspace (spec §1): menu grid on the left, live ticket on the
 * right. Handles both dine-in (resolved from a table + its open session, with
 * the order created lazily on the first send) and standalone orders (takeaway /
 * room service addressed directly by id).
 */
export function OrderScreen({ tableId, orderId }: { tableId?: string; orderId?: string }) {
  const router = useRouter();

  const tableQuery = useTable(tableId ?? null);
  const table = tableId ? tableQuery.data : undefined;

  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const effectiveOrderId = orderId ?? table?.activeOrderId ?? createdOrderId;
  const orderQuery = useOrder(effectiveOrderId ?? null);
  const order = orderQuery.data ?? null;

  const channel: Channel = tableId
    ? table
      ? channelForArea(table.area)
      : 'dine_in_restaurant'
    : order?.channel ?? 'takeaway';

  const cartKey = tableId ? `table:${tableId}` : `order:${orderId}`;
  const cart = useCartStore((s) => s.carts[cartKey] ?? EMPTY_CART);
  const clearCart = useCartStore((s) => s.clear);

  const createOrder = useCreateOrder();
  const addItems = useAddItems();
  const sendToKitchen = useSendToKitchen();
  const openSession = useOpenSession();
  const scQuery = useServiceCharges();
  const pct = scQuery.data?.find((r) => r.channel === channel)?.percentage ?? 0;

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  // --- loading / guard states ------------------------------------------------

  if (tableId && tableQuery.isLoading) return <FullscreenSpinner />;
  if (tableId && tableQuery.isError) {
    return <CenterNote>Could not load this table.</CenterNote>;
  }
  if (tableId && table && !table.activeSessionId) {
    return (
      <CenterNote>
        <p className="mb-4 font-semibold text-slate-700">{table.name} isn’t open yet.</p>
        <Button
          size="lg"
          onClick={async () => {
            try {
              await openSession.mutateAsync({ tableId });
            } catch (e) {
              setError(e instanceof ApiError ? e.message : 'Could not open the table');
            }
          }}
        >
          Open table
        </Button>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </CenterNote>
    );
  }
  if (!tableId && orderId && orderQuery.isLoading && !order) return <FullscreenSpinner />;

  // --- send the current round ------------------------------------------------

  const handleSend = async () => {
    if (cart.length === 0) return;
    setError(null);
    setSending(true);
    const inputs = cart.map((l) => ({
      menuItemId: l.menuItemId,
      qty: l.qty,
      notes: l.notes.trim() ? l.notes.trim() : undefined,
    }));
    try {
      let targetId = effectiveOrderId ?? null;
      if (!targetId) {
        const created = await createOrder.mutateAsync({
          channel,
          tableSessionId: table?.activeSessionId ?? undefined,
          items: inputs,
        });
        targetId = created.id;
        setCreatedOrderId(created.id);
      } else {
        await addItems.mutateAsync({ orderId: targetId, items: inputs });
      }
      // Sweep every draft line (the round we just added) to the kitchen/bar.
      await sendToKitchen.mutateAsync({ orderId: targetId });
      clearCart(cartKey);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send the order');
    } finally {
      setSending(false);
    }
  };

  const title = tableId
    ? table?.name ?? 'Table'
    : order
      ? `${CHANNEL_LABELS[order.channel]} · #${order.id.slice(0, 6)}`
      : 'New order';

  const settledAway = () => {
    setPayOpen(false);
    clearCart(cartKey);
    router.push('/pos');
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <button
          type="button"
          onClick={() => router.push('/pos')}
          className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"
        >
          ← Floor
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-extrabold text-slate-900">{title}</h1>
        </div>
        <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
          {CHANNEL_LABELS[channel]}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
          {pct > 0 ? `+${pct}% service` : 'No service charge'}
        </span>
      </div>

      {error ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr,380px]">
        <div className="min-h-0 overflow-hidden border-r border-slate-200">
          <MenuGrid
            channel={channel}
            onPick={(pick) =>
              useCartStore.getState().add(cartKey, pick)
            }
          />
        </div>
        <div className="min-h-0">
          <OrderTicket
            order={order}
            orderId={effectiveOrderId ?? null}
            cartKey={cartKey}
            onSend={handleSend}
            sending={sending}
            onOpenPay={() => setPayOpen(true)}
          />
        </div>
      </div>

      {payOpen && order ? (
        <PayDialog order={order} onClose={() => setPayOpen(false)} onSettled={settledAway} />
      ) : null}
    </div>
  );
}

function CenterNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 text-center">
      {children}
    </div>
  );
}
