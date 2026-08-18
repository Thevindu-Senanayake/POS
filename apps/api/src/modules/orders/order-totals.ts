// Order-money math now lives in @pos/shared so the web POS reproduces the
// server's totals (and split-bill allocation) to the cent. Re-exported here so
// existing imports (`./order-totals`) inside the orders module keep working.
export {
  allocateProportional,
  computeOrderTotals,
  lineTotalOf,
  resolveDiscountAmount,
} from '@pos/shared';
export type { OrderTotals, TotalsDiscount, TotalsLine } from '@pos/shared';
