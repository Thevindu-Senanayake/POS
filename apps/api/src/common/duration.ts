const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Parses a human duration like `15m`, `7d`, `500ms` into milliseconds.
 * A bare number is treated as milliseconds. Throws on anything else.
 */
export function durationToMs(input: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(input.trim());
  if (!match) {
    const asNumber = Number(input);
    if (Number.isFinite(asNumber)) return asNumber;
    throw new Error(`Invalid duration: "${input}"`);
  }
  return Number(match[1]) * UNIT_MS[match[2]];
}
