import type { Channel } from './enums.js';

/**
 * Channels that inherit another channel's price when they have no explicit price
 * row of their own. The bar sells food at the restaurant's price rather than
 * maintaining a separate bar food menu — so a `dine_in_bar` order falls back to
 * the item's `dine_in_restaurant` price. An explicit `dine_in_bar` price always
 * wins (drinks, beer and pours keep their real bar prices).
 */
export const CHANNEL_PRICE_FALLBACK: Partial<Record<Channel, Channel>> = {
  dine_in_bar: 'dine_in_restaurant',
};

/**
 * Resolve the price row that applies to `channel`, honouring the fallback above.
 * Returns the matched row (or `undefined`) rather than a bare number so callers
 * can read `.price` whether it's a JS number (DTOs) or a Prisma.Decimal (server).
 * This is the single source of truth for channel pricing — the POS grid and the
 * server order-item snapshot both go through it, so the charged price always
 * equals the displayed one.
 */
export function resolveChannelPrice<T extends { channel: Channel }>(
  prices: readonly T[],
  channel: Channel,
): T | undefined {
  const exact = prices.find((p) => p.channel === channel);
  if (exact) return exact;
  const fallback = CHANNEL_PRICE_FALLBACK[channel];
  return fallback ? prices.find((p) => p.channel === fallback) : undefined;
}
