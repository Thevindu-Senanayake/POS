'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  formatMoney,
  lineTotalOf,
  round2,
  type DiscountType,
  type OrderDTO,
  type OrderItemDTO,
} from '@pos/shared';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import {
  useApplyDiscount,
  useRemoveDiscount,
  useRemoveItem,
  useRequestBill,
  useServe,
  useVoidItem,
} from './api';
import { useCartStore, type CartLine } from './cart-store';
import { ITEM_STATUS_STYLES, PAYABLE_STATUSES } from './format';
import { useAuthorizedAction, useCan } from './use-authorized-action';

const EMPTY_CART: CartLine[] = [];

interface OrderTicketProps {
  order: OrderDTO | null;
  orderId: string | null;
  cartKey: string;
  onSend: () => void | Promise<void>;
  sending: boolean;
  onOpenPay: () => void;
}

/**
 * The order ticket (spec §1): the current compose round (local cart) on top,
 * the fired lines with their kitchen/bar status below, discounts, and the
 * server-computed totals with the action bar. Serving, voiding and discounting
 * are permission-gated (§7) via {@link useAuthorizedAction}.
 */
export function OrderTicket({
  order,
  orderId,
  cartKey,
  onSend,
  sending,
  onOpenPay,
}: OrderTicketProps) {
  const cart = useCartStore((s) => s.carts[cartKey] ?? EMPTY_CART);
  const inc = useCartStore((s) => s.inc);
  const dec = useCartStore((s) => s.dec);
  const setNotes = useCartStore((s) => s.setNotes);
  const removeLine = useCartStore((s) => s.remove);

  const run = useAuthorizedAction();
  const can = useCan();

  const serve = useServe();
  const voidItem = useVoidItem();
  const applyDiscount = useApplyDiscount();
  const removeDiscount = useRemoveDiscount();
  const removeDraft = useRemoveItem();
  const requestBill = useRequestBill();

  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<OrderItemDTO | null>(null);
  const [discountFor, setDiscountFor] = useState<'order' | OrderItemDTO | null>(null);

  // Transient success confirmations (e.g. "Bill requested") auto-dismiss so the
  // ticket doesn't accumulate stale banners during a shift.
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(t);
  }, [note]);

  const items = order?.items ?? [];
  const sentItems = items.filter((it) => it.status === 'sent_to_kitchen');
  const serverDrafts = items.filter((it) => it.status === 'draft');
  const firedOrDraft = items.filter((it) => it.status !== 'cancelled');
  const cancelled = items.filter((it) => it.status === 'cancelled');

  const cartSubtotal = useMemo(
    () => round2(cart.reduce((sum, l) => sum + lineTotalOf({ qty: l.qty, unitPrice: l.unitPrice }), 0)),
    [cart],
  );

  const payable = !!order && PAYABLE_STATUSES.includes(order.status);
  const hasBillable = firedOrDraft.some((it) => it.status !== 'draft');

  const guard = async (
    perm: Parameters<typeof run>[0],
    key: string,
    fn: (pin?: string) => Promise<unknown>,
    opts?: { title?: string; description?: string },
  ) => {
    setError(null);
    setNote(null);
    setBusy(key);
    try {
      await run(perm, fn, opts);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  const doServe = (itemIds?: string[]) =>
    guard('mark_served', itemIds && itemIds.length === 1 ? `serve:${itemIds[0]}` : 'serve:all', () =>
      serve.mutateAsync({ orderId: orderId!, itemIds }),
    );

  const doRemoveDraft = (itemId: string) =>
    guard('take_orders', `rmdraft:${itemId}`, () =>
      removeDraft.mutateAsync({ orderId: orderId!, itemId }),
    );

  const doRequestBill = () =>
    guard('request_bill', 'bill', async () => {
      await requestBill.mutateAsync(orderId!);
      setNote('Bill requested. Tap Pay to print the bill and settle when the guest is ready.');
    });

  // Why the Pay button can't open the settle dialog yet — surfaced on click so a
  // gold-but-inactive button never just "does nothing". The bill only prints on
  // settlement (Pay / split / charge-to-room), so items must be fired first.
  const payBlocked = !order
    ? 'Add items and send them to the kitchen first.'
    : !hasBillable
      ? 'Send items to the kitchen before taking payment.'
      : !payable
        ? 'This order can’t be settled in its current state.'
        : null;

  const handlePay = () => {
    setError(null);
    setNote(null);
    if (payBlocked) {
      setError(payBlocked);
      return;
    }
    onOpenPay();
  };

  const doRemoveDiscount = (discountId: string) =>
    guard('apply_discount', `rmdisc:${discountId}`, () =>
      removeDiscount.mutateAsync({ orderId: orderId!, discountId }),
    );

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="m-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error}
          </div>
        ) : null}

        {note ? (
          <div className="m-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
            {note}
          </div>
        ) : null}

        {/* Current compose round -------------------------------------------- */}
        <Section title="This round" count={cart.length}>
          {cart.length === 0 ? (
            <EmptyHint>Tap menu items to build the order.</EmptyHint>
          ) : (
            <ul className="divide-y divide-sand-100">
              {cart.map((line, i) => (
                <li key={`${line.menuItemId}:${i}`} className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <QtyStepper
                      qty={line.qty}
                      onDec={() => dec(cartKey, i)}
                      onInc={() => inc(cartKey, i)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-800">{line.name}</div>
                      <div className="text-xs text-slate-500">
                        {formatMoney(line.unitPrice)} each
                      </div>
                    </div>
                    <div className="text-sm font-bold text-slate-900">
                      {formatMoney(lineTotalOf({ qty: line.qty, unitPrice: line.unitPrice }))}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(cartKey, i)}
                      className="rounded-md p-1 text-slate-400 hover:bg-sand-100 hover:text-red-600"
                      aria-label="Remove line"
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    value={line.notes}
                    onChange={(e) => setNotes(cartKey, i, e.target.value)}
                    placeholder="Add a note (e.g. no ice, well done)…"
                    className="mt-1.5 w-full rounded-md border border-sand-200 bg-sand-50 px-2 py-1 text-xs outline-none focus:border-brand-400 focus:bg-white"
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Fired / server-draft lines --------------------------------------- */}
        {firedOrDraft.length > 0 ? (
          <Section
            title="On order"
            count={firedOrDraft.length}
            action={
              sentItems.length > 0 && can('mark_served') ? (
                <button
                  type="button"
                  onClick={() => doServe(sentItems.map((it) => it.id))}
                  disabled={busy === 'serve:all'}
                  className="text-xs font-bold uppercase tracking-wide text-emerald-700 hover:underline disabled:opacity-50"
                >
                  {busy === 'serve:all' ? 'Serving…' : 'Serve all'}
                </button>
              ) : null
            }
          >
            <ul className="divide-y divide-sand-100">
              {firedOrDraft.map((it) => {
                const style = ITEM_STATUS_STYLES[it.status];
                return (
                  <li key={it.id} className="px-3 py-2">
                    <div className="flex items-start gap-2">
                      <span className="text-sm font-bold text-slate-500">{it.qty}×</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-800">{it.name}</div>
                        {it.notes ? (
                          <div className="truncate text-xs italic text-amber-700">“{it.notes}”</div>
                        ) : null}
                        <span
                          className={cn(
                            'mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                            style.badge,
                          )}
                        >
                          {style.label}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-slate-900">
                        {formatMoney(it.lineTotal)}
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {it.status === 'sent_to_kitchen' && can('mark_served') ? (
                        <LineAction
                          label={busy === `serve:${it.id}` ? 'Serving…' : 'Serve'}
                          tone="emerald"
                          disabled={busy === `serve:${it.id}`}
                          onClick={() => doServe([it.id])}
                        />
                      ) : null}
                      {it.status === 'draft' ? (
                        <LineAction
                          label="Remove"
                          tone="red"
                          disabled={busy === `rmdraft:${it.id}`}
                          onClick={() => doRemoveDraft(it.id)}
                        />
                      ) : null}
                      {(it.status === 'sent_to_kitchen' || it.status === 'served') &&
                      can('void') ? (
                        <LineAction
                          label="Void"
                          tone="red"
                          disabled={busy === `void:${it.id}`}
                          onClick={() => setVoidTarget(it)}
                        />
                      ) : null}
                      {it.status !== 'draft' && can('apply_discount') ? (
                        <LineAction
                          label="Discount"
                          tone="slate"
                          onClick={() => setDiscountFor(it)}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}

        {/* Discounts -------------------------------------------------------- */}
        {order && order.discounts.length > 0 ? (
          <Section title="Discounts" count={order.discounts.length}>
            <ul className="divide-y divide-sand-100">
              {order.discounts.map((d) => (
                <li key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-700">
                      {d.scope === 'order' ? 'Order' : 'Line'} ·{' '}
                      {d.type === 'percentage' ? `${d.value}%` : formatMoney(d.value)}
                    </div>
                    {d.reason ? <div className="truncate text-xs text-slate-500">{d.reason}</div> : null}
                  </div>
                  <span className="font-semibold text-emerald-700">−{formatMoney(d.amount)}</span>
                  {can('apply_discount') ? (
                    <button
                      type="button"
                      onClick={() => doRemoveDiscount(d.id)}
                      disabled={busy === `rmdisc:${d.id}`}
                      className="rounded-md p-1 text-slate-400 hover:bg-sand-100 hover:text-red-600 disabled:opacity-50"
                      aria-label="Remove discount"
                    >
                      ✕
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {cancelled.length > 0 ? (
          <div className="px-3 py-2 text-xs text-slate-400">
            {cancelled.length} voided item{cancelled.length > 1 ? 's' : ''}
          </div>
        ) : null}
      </div>

      {/* Footer: totals + actions ------------------------------------------- */}
      <div className="border-t border-sand-200 bg-sand-50 p-3">
        {order ? (
          <dl className="mb-3 space-y-1 text-sm">
            <Row label="Subtotal" value={formatMoney(order.subtotal)} />
            {order.discountTotal > 0 ? (
              <Row label="Discounts" value={`−${formatMoney(order.discountTotal)}`} muted />
            ) : null}
            <Row
              label="Service charge"
              value={order.serviceCharge > 0 ? formatMoney(order.serviceCharge) : '-'}
              muted
            />
            <Row label="Total" value={formatMoney(order.total)} strong />
          </dl>
        ) : null}

        {cart.length > 0 ? (
          <p className="mb-2 text-center text-xs font-medium text-amber-700">
            {formatMoney(cartSubtotal)} in this round - not sent yet
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            size="lg"
            onClick={() => void onSend()}
            disabled={cart.length === 0 || sending}
          >
            {sending ? <Spinner /> : `Send${cart.length ? ` (${cart.length})` : ''}`}
          </Button>
          {can('take_payment') ? (
            <Button variant="accent" size="lg" onClick={handlePay}>
              Pay
            </Button>
          ) : (
            <Button
              variant="accent"
              size="lg"
              disabled
              title="A cashier or admin login is required to take payment."
            >
              Pay
            </Button>
          )}
        </div>

        <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
          {can('apply_discount') && order ? (
            <FooterLink onClick={() => setDiscountFor('order')}>+ Order discount</FooterLink>
          ) : null}
          {can('request_bill') && payable && order?.status !== 'bill_requested' ? (
            <FooterLink onClick={doRequestBill} disabled={busy === 'bill'}>
              {busy === 'bill' ? 'Requesting…' : 'Request bill'}
            </FooterLink>
          ) : null}
        </div>
      </div>

      {voidTarget ? (
        <VoidDialog
          item={voidTarget}
          onCancel={() => setVoidTarget(null)}
          onConfirm={async (reason) => {
            const target = voidTarget;
            setVoidTarget(null);
            await guard(
              'void',
              `void:${target.id}`,
              (pin) =>
                voidItem.mutateAsync({
                  orderId: orderId!,
                  itemId: target.id,
                  reason,
                  managerPin: pin,
                }),
              { title: 'Void item', description: `Approve voiding “${target.name}”.` },
            );
          }}
        />
      ) : null}

      {discountFor ? (
        <DiscountDialog
          target={discountFor}
          onCancel={() => setDiscountFor(null)}
          onConfirm={async ({ type, value, reason }) => {
            const target = discountFor;
            setDiscountFor(null);
            await guard(
              'apply_discount',
              'discount',
              (pin) =>
                applyDiscount.mutateAsync({
                  orderId: orderId!,
                  dto: {
                    scope: target === 'order' ? 'order' : 'line',
                    type,
                    value,
                    reason,
                    orderItemId: target === 'order' ? undefined : target.id,
                  },
                  managerPin: pin,
                }),
              { title: 'Apply discount', description: 'Manager approval required.' },
            );
          }}
        />
      ) : null}
    </div>
  );
}

// --- Small presentational helpers -------------------------------------------

function Section({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-sand-100">
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
          {title}
          {count != null ? <span className="ml-1 text-slate-400">({count})</span> : null}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-4 text-sm text-slate-400">{children}</p>;
}

function QtyStepper({ qty, onDec, onInc }: { qty: number; onDec: () => void; onInc: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onDec}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-lg font-bold text-brand-700 ring-1 ring-brand-100 transition-colors hover:bg-brand-100"
        aria-label="Decrease"
      >
        −
      </button>
      <span className="w-6 text-center text-sm font-bold tabular-nums">{qty}</span>
      <button
        type="button"
        onClick={onInc}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-lg font-bold text-brand-700 ring-1 ring-brand-100 transition-colors hover:bg-brand-100"
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}

const LINE_TONES: Record<string, string> = {
  emerald: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50',
  red: 'border-red-200 text-red-700 hover:bg-red-50',
  slate: 'border-sand-300 text-slate-600 hover:bg-sand-100',
};

function LineAction({
  label,
  tone,
  onClick,
  disabled,
}: {
  label: string;
  tone: keyof typeof LINE_TONES;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50',
        LINE_TONES[tone],
      )}
    >
      {label}
    </button>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={cn('flex items-center justify-between', strong && 'mt-1 border-t border-sand-200 pt-2')}>
      <dt className={cn(strong ? 'font-bold text-slate-900' : muted ? 'text-slate-500' : 'text-slate-600')}>
        {label}
      </dt>
      <dd className={cn('tabular-nums', strong ? 'text-xl font-extrabold text-gradient' : 'font-semibold text-slate-700')}>
        {value}
      </dd>
    </div>
  );
}

function FooterLink({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="font-semibold text-brand-700 hover:underline disabled:opacity-50"
    >
      {children}
    </button>
  );
}

// --- Dialogs ----------------------------------------------------------------

function VoidDialog({
  item,
  onCancel,
  onConfirm,
}: {
  item: OrderItemDTO;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Modal open onClose={onCancel} title={`Void ${item.name}?`}>
      <p className="mb-3 text-sm text-slate-600">
        This reverses the stock deduction and records an audit entry.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (e.g. guest changed mind, wrong item)…"
        rows={3}
        className="mb-4 w-full rounded-lg border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" onClick={() => onConfirm(reason.trim())}>
          Void item
        </Button>
      </div>
    </Modal>
  );
}

function DiscountDialog({
  target,
  onCancel,
  onConfirm,
}: {
  target: 'order' | OrderItemDTO;
  onCancel: () => void;
  onConfirm: (v: { type: DiscountType; value: number; reason: string }) => void;
}) {
  const [type, setType] = useState<DiscountType>('percentage');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const numeric = Number(value);
  const valid = Number.isFinite(numeric) && numeric > 0 && (type !== 'percentage' || numeric <= 100);

  return (
    <Modal
      open
      onClose={onCancel}
      title={target === 'order' ? 'Order discount' : `Discount: ${target.name}`}
    >
      <div className="mb-3 flex gap-2">
        {(['percentage', 'flat'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={cn(
              'flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
              type === t
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-sand-300 text-slate-600 hover:bg-sand-100',
            )}
          >
            {t === 'percentage' ? 'Percentage %' : 'Flat amount'}
          </button>
        ))}
      </div>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={type === 'percentage' ? 'e.g. 10 (%)' : 'e.g. 500'}
        className="mb-3 w-full rounded-lg border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        className="mb-4 w-full rounded-lg border border-sand-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => onConfirm({ type, value: numeric, reason: reason.trim() })}
          disabled={!valid}
        >
          Apply
        </Button>
      </div>
    </Modal>
  );
}
