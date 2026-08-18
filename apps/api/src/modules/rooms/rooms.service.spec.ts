import { Prisma } from '@pos/db';
import { nightsBetween, round2, sumMoney } from '@pos/shared';
import { effectiveRate } from './rooms.service';

/**
 * Unit tests for room-rate resolution and the checkout-total arithmetic
 * (spec §2.7). `effectiveRate` is the real function the booking flow snapshots
 * at creation; the checkout-total block locks the nights × rate + folio formula
 * that `BookingsService.toBookingDTO` composes from these same primitives.
 */
describe('effectiveRate (spec §2.7)', () => {
  it('uses the category default when the room has no override', () => {
    expect(effectiveRate(null, 12000)).toBe(12000);
  });

  it('prefers the room override when present', () => {
    expect(effectiveRate(15000, 12000)).toBe(15000);
  });

  it('accepts Prisma.Decimal inputs (as they arrive from the DB)', () => {
    expect(effectiveRate(new Prisma.Decimal(9000), new Prisma.Decimal(12000))).toBe(9000);
    expect(effectiveRate(null, new Prisma.Decimal(12000))).toBe(12000);
  });
});

describe('checkout total composition (spec §2.7)', () => {
  it('bills nights × agreed rate plus the folio total', () => {
    const nights = nightsBetween('2026-08-10', '2026-08-13'); // 3 nights
    expect(nights).toBe(3);

    const agreedRate = 13000;
    const roomCharge = round2(nights * agreedRate);
    const folioTotal = sumMoney([1200, 800]); // e.g. minibar + a paid extra
    const grandTotal = round2(roomCharge + folioTotal);

    expect(roomCharge).toBe(39000);
    expect(folioTotal).toBe(2000);
    expect(grandTotal).toBe(41000);
  });

  it('counts a minimum of one night for a same-day stay', () => {
    expect(nightsBetween('2026-08-10', '2026-08-10')).toBe(1);
  });

  it('computes nights from Date objects identically to ISO strings', () => {
    const fromDates = nightsBetween(new Date('2026-08-10'), new Date('2026-08-15'));
    const fromStrings = nightsBetween('2026-08-10', '2026-08-15');
    expect(fromDates).toBe(5);
    expect(fromStrings).toBe(5);
  });
});
