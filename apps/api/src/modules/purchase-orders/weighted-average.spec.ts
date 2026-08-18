import { Prisma } from '@pos/db';
import { weightedAverageCost } from './weighted-average';

/**
 * Unit tests for goods-received weighted-average costing (spec §2.2). The real
 * `receive()` transaction calls this exact helper, so these lock the costing
 * formula that drives inventory valuation and the variance report.
 */
describe('weightedAverageCost', () => {
  it('blends incoming stock at its purchase price into the on-hand value', () => {
    // 100 @ 2.00 + 100 @ 4.00 → 600 / 200 = 3.00
    const cost = weightedAverageCost(100, 2, 100, 4);
    expect(cost.toNumber()).toBe(3);
  });

  it('weights by quantity, not a naive average of the two prices', () => {
    // 40000 @ 0.85 + 10000 @ 1.05 → 44500 / 50000 = 0.89
    const cost = weightedAverageCost(40000, 0.85, 10000, 1.05);
    expect(cost.toNumber()).toBe(0.89);
  });

  it('adopts the incoming unit cost on a first-ever receipt (no prior stock)', () => {
    const cost = weightedAverageCost(0, 0, 500, 3.2);
    expect(cost.toNumber()).toBe(3.2);
  });

  it('floors negative on-hand stock to zero so an oversold item cannot skew the average', () => {
    // oldStock clamped 0 → cost becomes the incoming price
    const cost = weightedAverageCost(-50, 2, 100, 4);
    expect(cost.toNumber()).toBe(4);
  });

  it('falls back to the incoming unit cost when there is nothing to divide by', () => {
    // oldStock 0 + qty 0 → denominator 0
    const cost = weightedAverageCost(0, 2, 0, 7);
    expect(cost.toNumber()).toBe(7);
  });

  it('returns a Decimal with full precision (caller rounds to 4dp for storage)', () => {
    // 1 @ 1 + 2 @ 2 → 5 / 3 = 1.6666…
    const cost = weightedAverageCost(1, 1, 2, 2);
    expect(cost).toBeInstanceOf(Prisma.Decimal);
    expect(cost.toDecimalPlaces(4).toNumber()).toBe(1.6667);
  });
});
