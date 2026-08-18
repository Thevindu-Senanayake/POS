import { clsx, type ClassValue } from 'clsx';

/** Conditional className joiner (clsx). Kept as a single indirection so class
 * merging strategy can change in one place later if needed. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
