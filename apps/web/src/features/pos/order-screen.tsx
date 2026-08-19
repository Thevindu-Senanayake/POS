'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Channel, SpiritPourDTO } from '@pos/shared';
import { ApiError } from '@/lib/api-client';
import { enqueueSend } from '@/lib/offline/sync';
import { useOfflineStore } from '@/lib/offline/store';
import { Button } from '@/components/ui/button';
import { FullscreenSpinner } from '@/components/ui/spinner';
import {
  scanBarcode,
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
import { MenuGrid, priceForChannel } from './menu-grid';
import { OrderTicket } from './order-ticket';
import { PayDialog } from './pay-dialog';
import { PourPicker } from './pour-picker';
import { useBarcodeScanner } from './use-barcode-scanner';

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

  const online = useOfflineStore((s) => s.online);
  const setOnline = useOfflineStore((s) => s.setOnline);
  const queuedForCart = useOfflineStore((s) => s.entries).filter((e) => e.cartKey === cartKey);

  const createOrder = useCreateOrder();
  const addItems = useAddItems();
  const sendToKitchen = useSendToKitchen();
  const openSession = useOpenSession();
  const scQuery = useServiceCharges();
  const pct = scQuery.data?.find((r) => r.channel === channel)?.percentage ?? 0;

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  // --- bar USB barcode scanner (spec feature (c)) ----------------------------
  // Only the bar screen listens for the HID scanner. A scanned whole-unit item
  // (bottled beer/cans) is added straight to the cart; a spirit bottle opens the
  // pour picker. Feedback surfaces in a transient banner.
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [pourPick, setPourPick] = useState<{
    ingredientName: string;
    pours: SpiritPourDTO[];
  } | null>(null);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashScan = (message: string) => {
    setScanNote(message);
    if (scanTimer.current) clearTimeout(scanTimer.current);
    scanTimer.current = setTimeout(() => setScanNote(null), 2800);
  };
  useEffect(
    () => () => {
      if (scanTimer.current) clearTimeout(scanTimer.current);
    },
    [],
  );

  const handleScan = async (code: string) => {
    try {
      const result = await scanBarcode(code);
      if (result.kind === 'item') {
        const price = priceForChannel(result.item, channel);
        if (price === undefined) {
          flashScan(`${result.item.name} isn’t sold at the bar`);
          return;
        }
        useCartStore.getState().add(cartKey, {
          menuItemId: result.item.id,
          name: result.item.name,
          unitPrice: price,
        });
        flashScan(`Added ${result.item.name}`);
      } else if (result.kind === 'spirit') {
        if (result.pours.length === 0) {
          flashScan(`${result.ingredientName} has no pour sizes set`);
          return;
        }
        setPourPick({ ingredientName: result.ingredientName, pours: result.pours });
      } else {
        flashScan(`No match for ${code}`);
      }
    } catch {
      flashScan('Scan lookup failed — is the server reachable?');
    }
  };

  // Enable only on an open bar table (the order workspace is showing).
  const barScanEnabled = channel === 'dine_in_bar' && !!table?.activeSessionId;
  useBarcodeScanner(barScanEnabled, handleScan);

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
    // Metadata carried on a queued round so replay can recreate/attach the order.
    const queueBase = {
      cartKey,
      label: tableId ? table?.name ?? 'Table' : CHANNEL_LABELS[channel],
      channel,
      tableId,
      tableSessionId: table?.activeSessionId ?? undefined,
    };

    // Known offline: durably queue the whole round without hitting the network.
    // Stock deduction / KOT will only fire when this replays and the server
    // accepts it (spec §9) — never from this local draft.
    if (!online) {
      await enqueueSend({ ...queueBase, orderId: effectiveOrderId ?? undefined, items: inputs });
      clearCart(cartKey);
      setSending(false);
      return;
    }

    let targetId = effectiveOrderId ?? null;
    let committedItems = false; // items already accepted by the server this attempt
    try {
      if (!targetId) {
        const created = await createOrder.mutateAsync({
          channel,
          tableSessionId: table?.activeSessionId ?? undefined,
          items: inputs,
        });
        targetId = created.id;
        setCreatedOrderId(created.id);
        committedItems = true;
      } else {
        await addItems.mutateAsync({ orderId: targetId, items: inputs });
        committedItems = true;
      }
      // Sweep every draft line (the round we just added) to the kitchen/bar.
      await sendToKitchen.mutateAsync({ orderId: targetId });
      clearCart(cartKey);
    } catch (e) {
      if (e instanceof ApiError) {
        // Server reachable, genuine rejection — surface it and keep the cart.
        setError(e.message);
      } else {
        // Network failure — durably queue so nothing is lost, and mark offline.
        setOnline(false);
        if (committedItems && targetId) {
          // The create/add already landed; only the kitchen send didn't — queue
          // a send-only round so replay just fires the KOT (no duplicate items).
          await enqueueSend({ ...queueBase, orderId: targetId, items: [] });
        } else {
          await enqueueSend({ ...queueBase, orderId: targetId ?? undefined, items: inputs });
        }
        clearCart(cartKey);
      }
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

      {scanNote ? (
        <div className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-800">
          {scanNote}
        </div>
      ) : null}

      {queuedForCart.length > 0 ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
          {queuedForCart.length} round{queuedForCart.length === 1 ? '' : 's'} queued offline —{' '}
          {online ? 'syncing…' : 'will send when the connection returns'}. Stock and the KOT fire only
          after the server confirms.
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

      {pourPick ? (
        <PourPicker
          open
          ingredientName={pourPick.ingredientName}
          pours={pourPick.pours}
          channel={channel}
          onClose={() => setPourPick(null)}
          onPick={(pour) => {
            const price = priceForChannel(pour.item, channel);
            if (price !== undefined) {
              useCartStore.getState().add(cartKey, {
                menuItemId: pour.item.id,
                name: pour.item.name,
                unitPrice: price,
              });
              flashScan(`Added ${pour.item.name}`);
            }
            setPourPick(null);
          }}
        />
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
