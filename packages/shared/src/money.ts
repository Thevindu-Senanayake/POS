/** Round to 2 decimal places, avoiding binary float drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Sum a list of amounts, rounded to 2dp. */
export function sumMoney(amounts: number[]): number {
  return round2(amounts.reduce((acc, n) => acc + n, 0));
}

/** Apply a percentage (e.g. 10 => 10%) to a base amount, rounded to 2dp. */
export function percentageOf(base: number, percentage: number): number {
  return round2((base * percentage) / 100);
}

export const DEFAULT_CURRENCY_SYMBOL = '₨';

export function formatMoney(amount: number, symbol: string = DEFAULT_CURRENCY_SYMBOL): string {
  const value = round2(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${value}`;
}

/** Nights between two ISO dates/Date objects (min 1). */
export function nightsBetween(checkIn: string | Date, checkOut: string | Date): number {
  const inMs = new Date(checkIn).getTime();
  const outMs = new Date(checkOut).getTime();
  const nights = Math.round((outMs - inMs) / (1000 * 60 * 60 * 24));
  return Math.max(1, nights);
}
