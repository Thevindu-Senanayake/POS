import { Prisma } from '@pos/db';

/** Prisma Decimal (or number/string) -> JS number for API responses. */
export function decToNum(value: Prisma.Decimal | number | string): number {
  return typeof value === 'number' ? value : Number(value.toString());
}

export function decToNumOrNull(
  value: Prisma.Decimal | number | string | null | undefined,
): number | null {
  return value == null ? null : decToNum(value);
}
