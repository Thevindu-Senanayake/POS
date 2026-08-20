import { isSpiritPour } from './menu.service';

/**
 * The spirit-pour predicate (bar grid feature) decides which MenuItems collapse
 * into a per-bottle "pick a size" tile. It must include only a single-line recipe
 * drawing from an `ml` bottle, and exclude food (multi-line / g / pcs) and
 * beer/cans (no recipe). These boundaries aren't exercised by the seed-backed e2e,
 * so they're pinned here on synthetic rows.
 */
describe('isSpiritPour (bar spirit grouping)', () => {
  const row = (units: string[]) => ({
    recipes: units.map((baseUnit) => ({ ingredient: { baseUnit } })),
  });

  it('includes a single-line recipe on an ml ingredient (a spirit pour)', () => {
    expect(isSpiritPour(row(['ml']))).toBe(true);
  });

  it('excludes beer/cans — a whole-unit item with no recipe', () => {
    expect(isSpiritPour(row([]))).toBe(false);
  });

  it('excludes food dishes — multi-line recipes (even if some line is ml)', () => {
    expect(isSpiritPour(row(['g', 'pcs', 'g']))).toBe(false);
    expect(isSpiritPour(row(['ml', 'g']))).toBe(false);
  });

  it('excludes a single-line recipe drawing from a non-ml ingredient', () => {
    expect(isSpiritPour(row(['g']))).toBe(false);
    expect(isSpiritPour(row(['pcs']))).toBe(false);
  });
});
