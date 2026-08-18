import {
  allocateProportional,
  computeOrderTotals,
  lineTotalOf,
  resolveDiscountAmount,
  type TotalsDiscount,
  type TotalsLine,
} from '@pos/shared';

/**
 * Unit tests for the pure order-money engine (spec §2.5/§2.6). This is the
 * single source of truth shared by the API and the web POS, so a regression
 * here would silently mis-bill guests — hence the exhaustive edge coverage.
 */
describe('lineTotalOf', () => {
  it('multiplies qty by unit price to 2dp', () => {
    expect(lineTotalOf({ qty: 3, unitPrice: 250 })).toBe(750);
  });

  it('rounds away binary float drift', () => {
    // 3 * 0.1 = 0.30000000000000004 in IEEE-754
    expect(lineTotalOf({ qty: 3, unitPrice: 0.1 })).toBe(0.3);
  });
});

describe('computeOrderTotals — service charge by channel (spec §2.5)', () => {
  const lines: TotalsLine[] = [{ id: 'a', qty: 1, unitPrice: 850, cancelled: false }];

  it('applies the restaurant 10% service charge on the net', () => {
    const t = computeOrderTotals(lines, [], 10);
    expect(t).toEqual({ subtotal: 850, discountTotal: 0, serviceCharge: 85, total: 935 });
  });

  it('charges 0% for bar dine-in / takeaway (total equals subtotal)', () => {
    const t = computeOrderTotals(lines, [], 0);
    expect(t).toEqual({ subtotal: 850, discountTotal: 0, serviceCharge: 0, total: 850 });
  });

  it('computes service charge on the post-discount net, not the gross', () => {
    const discounts: TotalsDiscount[] = [{ scope: 'order', amount: 100, orderItemId: null }];
    const t = computeOrderTotals(lines, discounts, 10);
    // net 750 → 10% = 75 → total 825
    expect(t).toEqual({ subtotal: 850, discountTotal: 100, serviceCharge: 75, total: 825 });
  });
});

describe('computeOrderTotals — cancelled lines & discounts', () => {
  it('excludes cancelled lines from every total', () => {
    const lines: TotalsLine[] = [
      { id: 'a', qty: 1, unitPrice: 850, cancelled: false },
      { id: 'b', qty: 2, unitPrice: 200, cancelled: true },
    ];
    const t = computeOrderTotals(lines, [], 10);
    expect(t.subtotal).toBe(850);
    expect(t.total).toBe(935);
  });

  it('ignores a line-scoped discount attached to a cancelled line', () => {
    const lines: TotalsLine[] = [
      { id: 'a', qty: 1, unitPrice: 850, cancelled: false },
      { id: 'b', qty: 1, unitPrice: 500, cancelled: true },
    ];
    const discounts: TotalsDiscount[] = [{ scope: 'line', amount: 250, orderItemId: 'b' }];
    const t = computeOrderTotals(lines, discounts, 0);
    expect(t.discountTotal).toBe(0);
    expect(t.total).toBe(850);
  });

  it('clamps a discount so it can never exceed the subtotal', () => {
    const lines: TotalsLine[] = [{ id: 'a', qty: 1, unitPrice: 100, cancelled: false }];
    const discounts: TotalsDiscount[] = [{ scope: 'order', amount: 1000, orderItemId: null }];
    const t = computeOrderTotals(lines, discounts, 10);
    expect(t.discountTotal).toBe(100);
    expect(t.total).toBe(0);
  });
});

describe('resolveDiscountAmount (spec §8)', () => {
  it('resolves a percentage against the base', () => {
    expect(resolveDiscountAmount('percentage', 10, 850)).toBe(85);
  });

  it('resolves a flat amount as entered', () => {
    expect(resolveDiscountAmount('flat', 200, 850)).toBe(200);
  });

  it('clamps a flat amount to the base', () => {
    expect(resolveDiscountAmount('flat', 5000, 850)).toBe(850);
  });

  it('never returns a negative amount', () => {
    expect(resolveDiscountAmount('flat', -50, 850)).toBe(0);
    expect(resolveDiscountAmount('percentage', 10, -100)).toBe(0);
  });
});

describe('allocateProportional — split-bill sum integrity (spec §2.6)', () => {
  it('splits proportionally and the parts sum back exactly', () => {
    const parts = allocateProportional(100, [1, 1]);
    expect(parts).toEqual([50, 50]);
    expect(parts.reduce((s, n) => s + n, 0)).toBe(100);
  });

  it('hands the rounding remainder out so cents are never lost', () => {
    // 100 across three equal parts can't divide evenly in whole cents
    const parts = allocateProportional(100, [1, 1, 1]);
    expect(parts.reduce((s, n) => s + n, 0)).toBeCloseTo(100, 10);
    // largest-remainder: two parts get the extra cent
    expect(parts.filter((p) => p === 33.34)).toHaveLength(1);
  });

  it('allocates by weight, not evenly', () => {
    const parts = allocateProportional(90, [2, 1]);
    expect(parts).toEqual([60, 30]);
  });

  it('returns zeros when there is nothing to allocate', () => {
    expect(allocateProportional(0, [1, 1])).toEqual([0, 0]);
    expect(allocateProportional(50, [0, 0])).toEqual([0, 0]);
  });
});
