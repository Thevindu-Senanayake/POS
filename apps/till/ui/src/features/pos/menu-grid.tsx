'use client';

import { useMemo, useState } from 'react';
import { formatMoney, resolveChannelPrice } from '@pos/shared';
import type { Channel, MenuCategory, MenuItemDTO, SpiritGroupDTO } from '@pos/shared';
import { cn } from '@pos/client-core';
import { Spinner } from '@pos/client-core';
import { useMenu, useSpirits } from './api';

const CATEGORY_TABS: { key: MenuCategory; label: string }[] = [
  { key: 'food', label: 'Food' },
  { key: 'bar', label: 'Bar' },
  { key: 'room_service', label: 'Room Service' },
];

const STATION_TAG: Record<string, string> = {
  kitchen: 'bg-orange-100 text-orange-700 ring-1 ring-orange-200',
  bar: 'bg-purple-100 text-purple-700 ring-1 ring-purple-200',
};

/** Section heading when an item has no `menuGroup` — keyed by its coarse category. */
const CATEGORY_FALLBACK_LABEL: Record<MenuCategory, string> = {
  food: 'Food',
  bar: 'Bar',
  room_service: 'Room Service',
};

export interface MenuPick {
  menuItemId: string;
  name: string;
  unitPrice: number;
}

/**
 * Price for this order's channel; undefined => the item isn't sold on it.
 * Bar orders inherit the restaurant price for food with no explicit bar price
 * (see {@link resolveChannelPrice}), so food tiles appear on bar tables too.
 */
export function priceForChannel(item: MenuItemDTO, channel: Channel): number | undefined {
  return resolveChannelPrice(item.prices, channel)?.price;
}

/** A tile in the grid: a normal menu item, or a spirit bottle (opens the pour picker). */
type GridEntry =
  | { kind: 'item'; item: MenuItemDTO }
  | { kind: 'spirit'; group: SpiritGroupDTO };

const entryName = (e: GridEntry) =>
  e.kind === 'spirit' ? e.group.ingredientName : e.item.name;

/**
 * Menu grid (spec §1 order screen): items filtered to the order's channel
 * (only those with a channel price are orderable), grouped by category with a
 * quick search. Tapping a food/beer card adds one to the compose cart; spirits
 * are collapsed to one tile per bottle that opens the pour picker via
 * `onPickSpirit` (the individual pour sizes are hidden from the flat tiles).
 */
export function MenuGrid({
  channel,
  onPick,
  onPickSpirit,
}: {
  channel: Channel;
  onPick: (pick: MenuPick) => void;
  onPickSpirit: (group: SpiritGroupDTO) => void;
}) {
  const menu = useMenu();
  const spirits = useSpirits();
  const [category, setCategory] = useState<MenuCategory>('food');
  const [search, setSearch] = useState('');

  // Every pour MenuItem id, so the flat feed can drop them — built from the full,
  // unfiltered spirits list so a pour never leaks in even when priced this channel.
  const pourItemIds = useMemo(
    () => new Set((spirits.data ?? []).flatMap((g) => g.pours.map((p) => p.item.id))),
    [spirits.data],
  );

  const available = useMemo(
    () =>
      (menu.data ?? []).filter(
        (it) =>
          it.isActive &&
          priceForChannel(it, channel) !== undefined &&
          !pourItemIds.has(it.id),
      ),
    [menu.data, channel, pourItemIds],
  );

  // Spirit bottles orderable on this channel (≥1 pour priced), mirroring the
  // per-channel price filtering `available` applies to flat items.
  const availableSpirits = useMemo(
    () =>
      (spirits.data ?? []).filter((g) =>
        g.pours.some((p) => priceForChannel(p.item, channel) !== undefined),
      ),
    [spirits.data, channel],
  );

  const tabs = useMemo(() => {
    const present = new Set(available.map((it) => it.category));
    // Fold in spirit categories: a spirits-only bar has no flat `bar` items, so
    // without this the Bar tab (and the whole feature) would vanish.
    if (availableSpirits.length > 0) {
      present.add(availableSpirits[0].pours[0].item.category);
    }
    return CATEGORY_TABS.filter((t) => present.has(t.key));
  }, [available, availableSpirits]);

  const activeCategory = tabs.some((t) => t.key === category)
    ? category
    : tabs[0]?.key ?? 'food';

  // Within the active category, group tiles by `menuGroup` (fine sheet category,
  // e.g. Arrack / Whisky / Beer) so the bar's ~200 pours stay navigable; items
  // without a group fall back to a single section named for their category.
  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byGroup = new Map<string, GridEntry[]>();
    const push = (label: string, entry: GridEntry) => {
      const bucket = byGroup.get(label) ?? [];
      bucket.push(entry);
      byGroup.set(label, bucket);
    };
    for (const it of available) {
      if (it.category !== activeCategory) continue;
      if (q && !it.name.toLowerCase().includes(q)) continue;
      const label = it.menuGroup?.trim() || CATEGORY_FALLBACK_LABEL[it.category];
      push(label, { kind: 'item', item: it });
    }
    for (const g of availableSpirits) {
      const cat = g.pours[0].item.category;
      if (cat !== activeCategory) continue;
      if (
        q &&
        !g.ingredientName.toLowerCase().includes(q) &&
        !(g.menuGroup ?? '').toLowerCase().includes(q)
      ) {
        continue;
      }
      const label = g.menuGroup?.trim() || CATEGORY_FALLBACK_LABEL[cat];
      push(label, { kind: 'spirit', group: g });
    }
    return [...byGroup.entries()]
      .map(([label, entries]) => ({
        label,
        entries: entries.sort((a, b) => entryName(a).localeCompare(entryName(b))),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [available, availableSpirits, activeCategory, search]);

  if (menu.isLoading || spirits.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-brand-500">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  if (menu.isError || spirits.isError) {
    return (
      <div className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Could not load the menu.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 border-b border-sand-200 bg-sand-50/60 p-3">
        <input
          type="search"
          inputMode="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search menu…"
          className="w-full rounded-xl border border-sand-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        {tabs.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setCategory(t.key)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all',
                  t.key === activeCategory
                    ? 'bg-brand-gradient text-white shadow-sm'
                    : 'bg-white text-slate-600 ring-1 ring-sand-200 hover:bg-sand-100',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {sections.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            {search ? 'No matches.' : 'Nothing on this menu yet.'}
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {sections.map((section) => (
              <section key={section.label}>
                {sections.length > 1 ? (
                  <h3 className="mb-2 flex items-center gap-2 px-0.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {section.label}
                    <span className="h-px flex-1 bg-gradient-to-r from-accent-300/60 to-transparent" />
                  </h3>
                ) : null}
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                  {section.entries.map((entry) =>
                    entry.kind === 'spirit' ? (
                      <SpiritTile
                        key={`spirit-${entry.group.ingredientId}`}
                        group={entry.group}
                        channel={channel}
                        onPickSpirit={onPickSpirit}
                      />
                    ) : (
                      <MenuTile
                        key={`item-${entry.item.id}`}
                        item={entry.item}
                        price={priceForChannel(entry.item, channel)!}
                        onPick={onPick}
                      />
                    ),
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** A single tappable menu tile: name, channel price, and station tag. */
function MenuTile({
  item,
  price,
  onPick,
}: {
  item: MenuItemDTO;
  price: number;
  onPick: (pick: MenuPick) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick({ menuItemId: item.id, name: item.name, unitPrice: price })}
      className={cn(
        'flex min-h-touch flex-col justify-between gap-2 rounded-2xl border border-sand-200 bg-white p-3 text-left shadow-card transition-all',
        'motion-safe:hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card-hover motion-safe:active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400',
      )}
    >
      <span className="line-clamp-2 text-sm font-semibold leading-tight text-slate-800">
        {item.name}
      </span>
      <span className="flex items-center justify-between gap-1">
        <span className="text-sm font-bold text-slate-900">{formatMoney(price)}</span>
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase',
            STATION_TAG[item.station] ?? 'bg-sand-100 text-slate-600 ring-1 ring-sand-200',
          )}
        >
          {item.station}
        </span>
      </span>
    </button>
  );
}

/**
 * A spirit bottle as one tile: the bottle name and its cheapest pour ("from …"),
 * signalling "pick a size". Tapping opens the pour picker (same one the scanner
 * uses) rather than adding to the cart directly. Styled distinctly from a plain
 * menu tile — a teal-tinted bottle card with a gold "from" price and a "🍾 size"
 * cue — so staff read it as a chooser, not a one-tap add.
 */
function SpiritTile({
  group,
  channel,
  onPickSpirit,
}: {
  group: SpiritGroupDTO;
  channel: Channel;
  onPickSpirit: (group: SpiritGroupDTO) => void;
}) {
  // Guaranteed ≥1 priced pour by `availableSpirits`, so `from` is always finite.
  const from = Math.min(
    ...group.pours
      .map((p) => priceForChannel(p.item, channel))
      .filter((p): p is number => p !== undefined),
  );
  return (
    <button
      type="button"
      onClick={() => onPickSpirit(group)}
      className={cn(
        'flex min-h-touch flex-col justify-between gap-2 rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50/70 to-white p-3 text-left shadow-card transition-all',
        'motion-safe:hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card-hover motion-safe:active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400',
      )}
    >
      <span className="line-clamp-2 text-sm font-semibold leading-tight text-slate-800">
        {group.ingredientName}
      </span>
      <span className="flex items-center justify-between gap-1">
        <span className="text-sm font-bold text-accent-700">
          <span className="text-xs font-medium text-slate-400">from </span>
          {formatMoney(from)}
        </span>
        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700 ring-1 ring-brand-200">
          🍾 size
        </span>
      </span>
    </button>
  );
}
