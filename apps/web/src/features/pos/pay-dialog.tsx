'use client';

import { useMemo, useState } from 'react';
import {
  allocateProportional,
  formatMoney,
  lineTotalOf,
  round2,
  type OrderDTO,
  type OrderItemDTO,
} from '@pos/shared';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import {
  useChargeToRoom,
  usePay,
  useServiceCharges,
  useSplitBill,
  useCheckedInBookings,
  type PaymentInput,
} from './api';
import { useAuthorizedAction } from './use-authorized-action';

type Mode = 'pay' | 'split' | 'room';

interface Tender {
  cash: string;
  card: string;
}

const emptyTender = (): Tender => ({ cash: '', card: '' });

function num(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function tenderSum(t: Tender): number {
  return round2(num(t.cash) + num(t.card));
}

function buildPayments(t: Tender): PaymentInput[] {
  const out: PaymentInput[] = [];
  const cash = round2(num(t.cash));
  const card = round2(num(t.card));
  if (cash > 0) out.push({ method: 'cash', amount: cash });
  if (card > 0) out.push({ method: 'card', amount: card });
  return out;
}

interface PartTotals {
  subtotal: number;
  discountTotal: number;
  serviceCharge: number;
  total: number;
}

/**
 * Reproduce the server's per-part split math exactly (orders.service.ts): each
 * part's subtotal is Σ line totals; order-level discounts are allocated across
 * parts by subtotal weight (largest-remainder); line discounts attach to their
 * item; service charge applies to the net at the channel percentage.
 */
function computeSplitTotals(order: OrderDTO, groups: string[][], pct: number): PartTotals[] {
  const itemById = new Map(
    order.items.filter((i) => i.status !== 'cancelled').map((i) => [i.id, i]),
  );
  const partSubtotals = groups.map((ids) =>
    round2(
      ids.reduce((sum, id) => {
        const it = itemById.get(id);
        return it ? sum + lineTotalOf({ qty: it.qty, unitPrice: it.unitPrice }) : sum;
      }, 0),
    ),
  );
  const orderDiscountTotal = round2(
    order.discounts.filter((d) => d.scope === 'order').reduce((s, d) => s + d.amount, 0),
  );
  const shares = allocateProportional(orderDiscountTotal, partSubtotals);

  return groups.map((ids, idx) => {
    const subtotal = partSubtotals[idx];
    const lineDiscount = round2(
      ids.reduce((sum, id) => {
        const lds = order.discounts.filter((d) => d.scope === 'line' && d.orderItemId === id);
        return sum + lds.reduce((s, d) => s + d.amount, 0);
      }, 0),
    );
    const discountTotal = Math.min(round2(lineDiscount + shares[idx]), subtotal);
    const net = round2(subtotal - discountTotal);
    const serviceCharge = round2((net * pct) / 100);
    const total = round2(net + serviceCharge);
    return { subtotal, discountTotal, serviceCharge, total };
  });
}

interface PayDialogProps {
  order: OrderDTO;
  onClose: () => void;
  onSettled: () => void;
}

/** Settlement dialog (spec §2.5/2.6/2.7): full pay, split bill, or charge-to-room. */
export function PayDialog({ order, onClose, onSettled }: PayDialogProps) {
  const [mode, setMode] = useState<Mode>('pay');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const run = useAuthorizedAction();
  const pay = usePay();
  const split = useSplitBill();
  const chargeToRoom = useChargeToRoom();
  const scQuery = useServiceCharges();

  const pct = scQuery.data?.find((r) => r.channel === order.channel)?.percentage ?? 0;
  const activeItems = useMemo(
    () => order.items.filter((it) => it.status !== 'cancelled'),
    [order.items],
  );

  const settle = async (
    perm: Parameters<typeof run>[0],
    fn: (pin?: string) => Promise<unknown>,
    opts?: { title?: string; description?: string },
  ) => {
    setError(null);
    setSubmitting(true);
    try {
      const ok = await run(perm, fn, opts);
      if (ok) onSettled();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Settlement failed');
    } finally {
      setSubmitting(false);
    }
  };

  const tabs: { key: Mode; label: string }[] = [
    { key: 'pay', label: 'Pay' },
    { key: 'split', label: 'Split' },
    { key: 'room', label: 'To room' },
  ];

  return (
    <Modal open onClose={onClose} title="Settle order" widthClassName="max-w-lg">
      <div className="mb-4 flex gap-1 rounded-xl bg-sand-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setMode(t.key);
              setError(null);
            }}
            className={cn(
              'flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-colors',
              mode === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      {mode === 'pay' ? (
        <FullPay order={order} submitting={submitting} onPay={(payments) =>
          settle('take_payment', () => pay.mutateAsync({ orderId: order.id, payments }))
        } />
      ) : null}

      {mode === 'split' ? (
        <SplitPay
          order={order}
          items={activeItems}
          pct={pct}
          submitting={submitting}
          onSplit={(parts) =>
            settle(
              'split_merge',
              (pin) => split.mutateAsync({ orderId: order.id, parts, managerPin: pin }),
              { title: 'Split bill', description: 'Manager approval required.' },
            )
          }
        />
      ) : null}

      {mode === 'room' ? (
        <ChargeRoom
          order={order}
          submitting={submitting}
          onCharge={(bookingId, comp) =>
            settle('take_payment', () =>
              chargeToRoom.mutateAsync({ orderId: order.id, bookingId, comp }),
            )
          }
        />
      ) : null}
    </Modal>
  );
}

// --- Full payment -----------------------------------------------------------

function FullPay({
  order,
  submitting,
  onPay,
}: {
  order: OrderDTO;
  submitting: boolean;
  onPay: (payments: PaymentInput[]) => void;
}) {
  const [tender, setTender] = useState<Tender>(() => ({ cash: order.total.toFixed(2), card: '' }));
  const paid = tenderSum(tender);
  const matches = Math.abs(paid - order.total) <= 0.001;

  return (
    <div>
      <TotalHeadline label="Amount due" value={order.total} />
      <TenderInputs tender={tender} onChange={setTender} />
      <QuickFill
        onExactCash={() => setTender({ cash: order.total.toFixed(2), card: '' })}
        onExactCard={() => setTender({ cash: '', card: order.total.toFixed(2) })}
      />
      <BalanceLine paid={paid} total={order.total} />
      <Button
        variant="accent"
        className="mt-4 w-full"
        size="lg"
        disabled={!matches || submitting}
        onClick={() => onPay(buildPayments(tender))}
      >
        {submitting ? <Spinner /> : `Take ${formatMoney(order.total)}`}
      </Button>
    </div>
  );
}

// --- Split bill -------------------------------------------------------------

function SplitPay({
  order,
  items,
  pct,
  submitting,
  onSplit,
}: {
  order: OrderDTO;
  items: OrderItemDTO[];
  pct: number;
  submitting: boolean;
  onSplit: (parts: { label: string; orderItemIds: string[]; payments: PaymentInput[] }[]) => void;
}) {
  const [partCount, setPartCount] = useState(2);
  const [assign, setAssign] = useState<Record<string, number>>({});
  const [tenders, setTenders] = useState<Record<number, Tender>>({});

  const groups = useMemo(() => {
    const g: string[][] = Array.from({ length: partCount }, () => []);
    for (const it of items) {
      const p = Math.min(assign[it.id] ?? 0, partCount - 1);
      g[p].push(it.id);
    }
    return g;
  }, [items, assign, partCount]);

  const totals = useMemo(() => computeSplitTotals(order, groups, pct), [order, groups, pct]);

  const allPartsHaveItems = groups.every((g) => g.length > 0);
  const tendersMatch = totals.every((t, i) => {
    const sum = tenderSum(tenders[i] ?? emptyTender());
    return Math.abs(sum - t.total) <= 0.001;
  });
  const valid = allPartsHaveItems && tendersMatch;

  const setPartTender = (part: number, t: Tender) =>
    setTenders((prev) => ({ ...prev, [part]: t }));

  const fillAllExactCash = () =>
    setTenders(Object.fromEntries(totals.map((t, i) => [i, { cash: t.total.toFixed(2), card: '' }])));

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-600">Parts</span>
        {[2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setPartCount(n)}
            className={cn(
              'h-9 w-9 rounded-lg text-sm font-bold transition-colors',
              partCount === n ? 'bg-brand-gradient text-white shadow-sm' : 'bg-sand-100 text-slate-600 hover:bg-sand-200',
            )}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={fillAllExactCash}
          className="ml-auto text-xs font-semibold text-brand-700 hover:underline"
        >
          Fill all cash
        </button>
      </div>

      <div className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-sand-200">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2 border-b border-sand-100 px-2 py-1.5 last:border-0">
            <span className="min-w-0 flex-1 truncate text-sm">
              <span className="font-semibold text-slate-500">{it.qty}× </span>
              {it.name}
            </span>
            <div className="flex gap-1">
              {Array.from({ length: partCount }, (_, p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setAssign((prev) => ({ ...prev, [it.id]: p }))}
                  className={cn(
                    'h-7 w-7 rounded-md text-xs font-bold transition-colors',
                    (Math.min(assign[it.id] ?? 0, partCount - 1)) === p
                      ? 'bg-brand-600 text-white'
                      : 'bg-sand-100 text-slate-500 hover:bg-sand-200',
                  )}
                >
                  {p + 1}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {groups.map((ids, i) => {
          const t = totals[i];
          const tender = tenders[i] ?? emptyTender();
          const sum = tenderSum(tender);
          const ok = Math.abs(sum - t.total) <= 0.001;
          return (
            <div key={i} className="rounded-xl border border-sand-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700">
                  Part {i + 1} · {ids.length} item{ids.length === 1 ? '' : 's'}
                </span>
                <span className="text-sm font-extrabold text-slate-900">{formatMoney(t.total)}</span>
              </div>
              {ids.length === 0 ? (
                <p className="text-xs text-amber-600">Assign at least one item.</p>
              ) : (
                <>
                  <TenderInputs tender={tender} onChange={(nt) => setPartTender(i, nt)} compact />
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => setPartTender(i, { cash: t.total.toFixed(2), card: '' })}
                      className="font-semibold text-brand-700 hover:underline"
                    >
                      Exact cash
                    </button>
                    <span className={ok ? 'text-emerald-600' : 'text-red-600'}>
                      {ok ? 'Balanced' : `${formatMoney(sum)} / ${formatMoney(t.total)}`}
                    </span>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <Button
        variant="accent"
        className="mt-4 w-full"
        size="lg"
        disabled={!valid || submitting}
        onClick={() =>
          onSplit(
            groups.map((ids, i) => ({
              label: `Split ${i + 1}`,
              orderItemIds: ids,
              payments: buildPayments(tenders[i] ?? emptyTender()),
            })),
          )
        }
      >
        {submitting ? <Spinner /> : `Charge ${partCount} bills`}
      </Button>
    </div>
  );
}

// --- Charge to room ---------------------------------------------------------

function ChargeRoom({
  order,
  submitting,
  onCharge,
}: {
  order: OrderDTO;
  submitting: boolean;
  onCharge: (bookingId: string | undefined, comp: boolean) => void;
}) {
  const bookingsQuery = useCheckedInBookings();
  const [bookingId, setBookingId] = useState<string>(order.bookingId ?? '');
  const [comp, setComp] = useState(false);

  const bookings = bookingsQuery.data ?? [];
  const chosen = bookingId || order.bookingId || '';

  return (
    <div>
      <TotalHeadline label={comp ? 'Charged to room (comped)' : 'Charge to room'} value={comp ? 0 : order.total} />

      {bookingsQuery.isLoading ? (
        <div className="flex justify-center py-6 text-slate-400">
          <Spinner />
        </div>
      ) : bookings.length === 0 && !order.bookingId ? (
        <p className="rounded-lg bg-sand-50 px-3 py-4 text-center text-sm text-slate-500">
          No checked-in guests to charge.
        </p>
      ) : (
        <div className="max-h-48 space-y-1.5 overflow-y-auto">
          {bookings.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBookingId(b.id)}
              className={cn(
                'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                chosen === b.id
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-sand-200 hover:bg-sand-50',
              )}
            >
              <span>
                <span className="font-semibold text-slate-800">{b.guestName}</span>
                <span className="text-slate-500"> · Room {b.roomNumber ?? b.roomId}</span>
              </span>
              <span className="text-xs uppercase text-slate-400">{b.boardPlan.replace('_', ' ')}</span>
            </button>
          ))}
        </div>
      )}

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={comp}
          onChange={(e) => setComp(e.target.checked)}
          className="h-4 w-4 rounded border-sand-300 accent-brand-600"
        />
        Comp this charge (board plan) — folio at ₨0
      </label>

      <Button
        variant="accent"
        className="mt-4 w-full"
        size="lg"
        disabled={submitting || (!chosen)}
        onClick={() => onCharge(chosen || undefined, comp)}
      >
        {submitting ? <Spinner /> : 'Charge to room'}
      </Button>
    </div>
  );
}

// --- Shared bits ------------------------------------------------------------

function TotalHeadline({ label, value }: { label: string; value: number }) {
  return (
    <div className="mb-4 rounded-xl bg-brand-gradient px-4 py-3 text-center text-white shadow-card">
      <div className="text-xs uppercase tracking-wide text-white/70">{label}</div>
      <div className="text-3xl font-extrabold tabular-nums">{formatMoney(value)}</div>
    </div>
  );
}

function TenderInputs({
  tender,
  onChange,
  compact,
}: {
  tender: Tender;
  onChange: (t: Tender) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn('grid grid-cols-2 gap-2', compact ? '' : 'mt-1')}>
      <MoneyInput
        label="Cash"
        value={tender.cash}
        onChange={(v) => onChange({ ...tender, cash: v })}
      />
      <MoneyInput
        label="Card"
        value={tender.card}
        onChange={(v) => onChange({ ...tender, card: v })}
      />
    </div>
  );
}

function MoneyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-500">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className="w-full rounded-lg border border-sand-300 px-3 py-2 text-right text-sm tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}

function QuickFill({
  onExactCash,
  onExactCard,
}: {
  onExactCash: () => void;
  onExactCard: () => void;
}) {
  return (
    <div className="mt-2 flex gap-2 text-xs">
      <button
        type="button"
        onClick={onExactCash}
        className="rounded-lg bg-sand-100 px-3 py-1.5 font-semibold text-slate-600 hover:bg-sand-200"
      >
        Exact cash
      </button>
      <button
        type="button"
        onClick={onExactCard}
        className="rounded-lg bg-sand-100 px-3 py-1.5 font-semibold text-slate-600 hover:bg-sand-200"
      >
        Exact card
      </button>
    </div>
  );
}

function BalanceLine({ paid, total }: { paid: number; total: number }) {
  const diff = round2(paid - total);
  const matches = Math.abs(diff) <= 0.001;
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <span className="text-slate-500">Tendered</span>
      <span className={cn('font-bold tabular-nums', matches ? 'text-emerald-600' : 'text-red-600')}>
        {formatMoney(paid)}
        {!matches ? (
          <span className="ml-2 text-xs font-medium">
            ({diff > 0 ? '+' : ''}
            {formatMoney(diff)})
          </span>
        ) : null}
      </span>
    </div>
  );
}
