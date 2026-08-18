import { Prisma } from '@pos/db';

/**
 * Weighted-average unit cost after receiving stock (spec §2.2).
 *
 * Blends the incoming quantity at its purchase price into the existing on-hand
 * value, using stock/cost as they were *before* this receipt. Negative on-hand
 * stock (an oversold ingredient) is floored to zero so it can't drag the average
 * below the true blended cost. When there is nothing to blend against — no prior
 * positive stock and… well, `oldStock + qty == 0` — the incoming unit cost simply
 * becomes the new cost.
 *
 * All arithmetic is done with `Prisma.Decimal` so it matches what the ledger
 * persists to the cent; callers typically `.toDecimalPlaces(4)` the result before
 * writing it back to `Ingredient.costPerUnit`.
 */
export function weightedAverageCost(
  onHandStock: Prisma.Decimal.Value,
  currentCost: Prisma.Decimal.Value,
  incomingQty: Prisma.Decimal.Value,
  incomingUnitCost: Prisma.Decimal.Value,
): Prisma.Decimal {
  const current = new Prisma.Decimal(onHandStock);
  const oldStock = current.lessThan(0) ? new Prisma.Decimal(0) : current;
  const oldCost = new Prisma.Decimal(currentCost);
  const qty = new Prisma.Decimal(incomingQty);
  const unitCost = new Prisma.Decimal(incomingUnitCost);

  const denominator = oldStock.plus(qty);
  if (denominator.isZero()) {
    return unitCost;
  }
  return oldStock.times(oldCost).plus(qty.times(unitCost)).dividedBy(denominator);
}
