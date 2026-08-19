'use client';

import { formatMoney } from '@pos/shared';
import type { Channel, SpiritPourDTO } from '@pos/shared';
import { cn } from '@/lib/cn';
import { Modal } from '@/components/ui/modal';
import { priceForChannel } from './menu-grid';

/**
 * Shot equivalent for a pour (50 ml = 1 shot, per the owner's convention).
 * 25 ml is a half shot; sizes that aren't a whole/half number of shots get no
 * hint. Returned as a short caption shown beside the volume.
 */
function shotLabel(volumeMl: number): string | null {
  if (volumeMl === 25) return '½ shot';
  const shots = volumeMl / 50;
  if (Number.isInteger(shots) && shots >= 1) return `${shots} shot${shots === 1 ? '' : 's'}`;
  return null;
}

/**
 * Pour-size picker shown after scanning a spirit bottle (spec feature (c)). Lists
 * every priced pour for the bottle (25 → 750 ml, smallest first) with its shot
 * equivalent and the bar price; tapping one adds that pour to the order and the
 * exact volume is deducted from the bottle when the round is sent.
 */
export function PourPicker({
  open,
  ingredientName,
  pours,
  channel,
  onPick,
  onClose,
}: {
  open: boolean;
  ingredientName: string;
  pours: SpiritPourDTO[];
  channel: Channel;
  onPick: (pour: SpiritPourDTO) => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={ingredientName} widthClassName="max-w-md">
      <p className="mb-3 text-sm text-slate-500">
        Pick a pour — the exact volume is deducted from the bottle.
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {pours.map((pour) => {
          const price = priceForChannel(pour.item, channel);
          const shots = shotLabel(pour.volumeMl);
          return (
            <button
              key={pour.item.id}
              type="button"
              disabled={price === undefined}
              onClick={() => onPick(pour)}
              className={cn(
                'flex min-h-touch flex-col justify-between gap-1 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-all',
                'hover:border-brand-300 hover:shadow-md active:scale-[0.98]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:shadow-sm',
              )}
            >
              <span className="flex items-baseline gap-1.5">
                <span className="text-base font-extrabold text-slate-900">{pour.volumeMl} ml</span>
                {shots ? (
                  <span className="text-xs font-semibold text-slate-400">{shots}</span>
                ) : null}
              </span>
              <span className="text-sm font-bold text-slate-900">
                {price === undefined ? 'Not sold at bar' : formatMoney(price)}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
