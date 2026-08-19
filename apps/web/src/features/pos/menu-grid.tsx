'use client';

import { useMemo, useState } from 'react';
import { formatMoney } from '@pos/shared';
import type { Channel, MenuCategory, MenuItemDTO } from '@pos/shared';
import { cn } from '@/lib/cn';
import { Spinner } from '@/components/ui/spinner';
import { useMenu } from './api';

const CATEGORY_TABS: { key: MenuCategory; label: string }[] = [
  { key: 'food', label: 'Food' },
  { key: 'bar', label: 'Bar' },
  { key: 'room_service', label: 'Room Service' },
];

const STATION_TAG: Record<string, string> = {
  kitchen: 'bg-orange-100 text-orange-700',
  bar: 'bg-fuchsia-100 text-fuchsia-700',
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

/** Price for this order's channel; undefined => the item isn't sold on it. */
export function priceForChannel(item: MenuItemDTO, channel: Channel): number | undefined {
  return item.prices.find((p) => p.channel === channel)?.price;
}

/**
 * Menu grid (spec §1 order screen): items filtered to the order's channel
 * (only those with a channel price are orderable), grouped by category with a
 * quick search. Tapping a card adds one to the compose cart.
 */
export function MenuGrid({
  channel,
  onPick,
}: {
  channel: Channel;
  onPick: (pick: MenuPick) => void;
}) {
  const menu = useMenu();
  const [category, setCategory] = useState<MenuCategory>('food');
  const [search, setSearch] = useState('');

  const available = useMemo(
    () =>
      (menu.data ?? []).filter(
        (it) => it.isActive && priceForChannel(it, channel) !== undefined,
      ),
    [menu.data, channel],
  );

  const tabs = useMemo(() => {
    const present = new Set(available.map((it) => it.category));
    return CATEGORY_TABS.filter((t) => present.has(t.key));
  }, [available]);

  const activeCategory = tabs.some((t) => t.key === category)
    ? category
    : tabs[0]?.key ?? 'food';

  // Within the active category, group tiles by `menuGroup` (fine sheet category,
  // e.g. Arrack / Whisky / Beer) so the bar's ~200 pours stay navigable; items
  // without a group fall back to a single section named for their category.
  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byGroup = new Map<string, MenuItemDTO[]>();
    for (const it of available) {
      if (it.category !== activeCategory) continue;
      if (q && !it.name.toLowerCase().includes(q)) continue;
      const label = it.menuGroup?.trim() || CATEGORY_FALLBACK_LABEL[it.category];
      const bucket = byGroup.get(label) ?? [];
      bucket.push(it);
      byGroup.set(label, bucket);
    }
    return [...byGroup.entries()]
      .map(([label, items]) => ({
        label,
        items: items.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [available, activeCategory, search]);

  if (menu.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-slate-400">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  if (menu.isError) {
    return (
      <div className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Could not load the menu.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-3">
        <input
          type="search"
          inputMode="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search menu…"
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        {tabs.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setCategory(t.key)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
                  t.key === activeCategory
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
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
                  <h3 className="mb-2 px-0.5 text-xs font-bold uppercase tracking-wide text-slate-400">
                    {section.label}
                  </h3>
                ) : null}
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                  {section.items.map((item) => (
                    <MenuTile
                      key={item.id}
                      item={item}
                      price={priceForChannel(item, channel)!}
                      onPick={onPick}
                    />
                  ))}
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
        'flex min-h-touch flex-col justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-all',
        'hover:border-brand-300 hover:shadow-md active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
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
            STATION_TAG[item.station] ?? 'bg-slate-100 text-slate-600',
          )}
        >
          {item.station}
        </span>
      </span>
    </button>
  );
}
