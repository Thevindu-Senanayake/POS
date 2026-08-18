import type { DiscountScope, DiscountType } from '@pos/shared';
import { round2 } from '@pos/shared';

/** Minimal line shape needed to compute money totals. */
export interface TotalsLine {
  id: string;
  qty: number;
  unitPrice: number;
  /** Cancelled/voided lines are excluded from every total. */
  cancelled: boolean;
}

/** Minimal discount shape needed to compute money totals. */
export interface TotalsDiscount {
  scope: DiscountScope;
  amount: number;
  orderItemId: string | null;
}

export interface OrderTotals {
  subtotal: number;
  discountTotal: number;
  serviceCharge: number;
  total: number;
}

/** Line total = qty x unitPrice, to 2dp. */
export function lineTotalOf(line: { qty: number; unitPrice: number }): number {
  return round2(line.qty * line.unitPrice);
}

/**
 * Single source of truth for order money (spec §2.5/§2.6):
 *   subtotal      = Σ active line totals
 *   discountTotal = Σ discount amounts, ignoring discounts on cancelled lines,
 *                   clamped so it can never exceed the subtotal
 *   serviceCharge = channel% of (subtotal - discountTotal)
 *   total         = subtotal - discountTotal + serviceCharge
 */
export function computeOrderTotals(
  lines: TotalsLine[],
  discounts: TotalsDiscount[],
  serviceChargePct: number,
): OrderTotals {
  const active = lines.filter((l) => !l.cancelled);
  const activeIds = new Set(active.map((l) => l.id));
  const subtotal = round2(
    active.reduce((sum, l) => sum + lineTotalOf(l), 0),
  );

  const effective = discounts.filter(
    (d) => d.scope === 'order' || (d.orderItemId != null && activeIds.has(d.orderItemId)),
  );
  const rawDiscount = round2(effective.reduce((sum, d) => sum + d.amount, 0));
  const discountTotal = Math.min(rawDiscount, subtotal);

  const net = round2(subtotal - discountTotal);
  const serviceCharge = round2((net * serviceChargePct) / 100);
  const total = round2(net + serviceCharge);

  return { subtotal, discountTotal, serviceCharge, total };
}

/**
 * Resolve a discount's applied amount against a base (spec §8). Percentage is
 * base x value%, flat is the entered value; either way it is clamped to `base`
 * so a discount can never exceed what it applies to.
 */
export function resolveDiscountAmount(
  type: DiscountType,
  value: number,
  base: number,
): number {
  const clampedBase = Math.max(0, round2(base));
  const raw = type === 'percentage' ? round2((clampedBase * value) / 100) : round2(value);
  return Math.min(Math.max(0, raw), clampedBase);
}

/**
 * Split `amount` across buckets in proportion to `weights`, in whole cents, with
 * the rounding remainder handed to the buckets with the largest fractional part
 * (so the parts always sum back to `amount` exactly). Used to allocate an
 * order-level discount across split bills (spec §2.6).
 */
export function allocateProportional(amount: number, weights: number[]): number[] {
  const cents = Math.round(amount * 100);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (weights.length === 0 || totalWeight <= 0 || cents === 0) {
    return weights.map(() => 0);
  }

  const raw = weights.map((w) => (cents * w) / totalWeight);
  const floored = raw.map((r) => Math.floor(r));
  const distributed = floored.reduce((sum, n) => sum + n, 0);
  let remainder = cents - distributed;

  const byFraction = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floored];
  for (let k = 0; k < remainder; k++) {
    result[byFraction[k % byFraction.length].i] += 1;
  }
  return result.map((c) => c / 100);
}
