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
  // The largest pour is the whole bottle — label it "Bottle" (rather than "15
  // shots"). Guard with a bottle-sized floor so a spirit whose only pour is a
  // shot isn't mislabelled. `-Infinity` for an empty list never matches a volume.
  const maxVolumeMl = pours.length ? Math.max(...pours.map((p) => p.volumeMl)) : -Infinity;
  return (
    <Modal open={open} onClose={onClose} title={ingredientName} widthClassName="max-w-md">
      <p className="mb-3 text-sm text-slate-500">
        Pick a pour - the exact volume is deducted from the bottle.
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {pours.map((pour) => {
          const price = priceForChannel(pour.item, channel);
          const isBottle = pour.volumeMl === maxVolumeMl && maxVolumeMl >= 500;
          const caption = isBottle ? 'Bottle' : shotLabel(pour.volumeMl);
          return (
            <button
              key={pour.item.id}
              type="button"
              disabled={price === undefined}
              onClick={() => onPick(pour)}
              className={cn(
                'flex min-h-touch flex-col justify-between gap-1 rounded-2xl border p-3 text-left shadow-card transition-all',
                'motion-safe:hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50/40 hover:shadow-card-hover motion-safe:active:scale-[0.98]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400',
                'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:border-sand-200 disabled:hover:bg-white disabled:hover:shadow-card',
                isBottle ? 'border-accent-300 bg-gradient-to-br from-accent-50 to-white' : 'border-sand-200 bg-white',
              )}
            >
              <span className="flex items-baseline gap-1.5">
                <span className="text-base font-extrabold text-slate-900">{pour.volumeMl} ml</span>
                {caption ? (
                  isBottle ? (
                    <span className="rounded-full bg-accent-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-700 ring-1 ring-accent-200">
                      🍾 {caption}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-slate-400">{caption}</span>
                  )
                ) : null}
              </span>
              <span className="text-sm font-bold text-accent-700">
                {price === undefined ? (
                  <span className="font-semibold text-slate-400">Not sold at bar</span>
                ) : (
                  formatMoney(price)
                )}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
