'use client';

import { useMemo, useState } from 'react';
import { CHANNELS, DEFAULT_CURRENCY_CODE, DEFAULT_CURRENCY_SYMBOL, type Channel } from '@pos/shared';
import { ApiError } from '@pos/client-core';
import { Button } from '@pos/client-core';
import { FullscreenSpinner, Spinner } from '@pos/client-core';
import { useServiceCharges, useUpdateServiceCharge } from './api';
import { CHANNEL_LABELS } from './format';
import { AdminPage, ErrorNote, SectionCard, StatCard, inputClass } from './ui';

/**
 * Settings (spec §2.5/§10): service-charge rules per channel + currency.
 * Currency is a fixed system constant (₨); service charge is the one owner-
 * configurable pricing rule. Bar dine-in and takeaway default to 0% per §2.5.
 */
export function SettingsScreen() {
  const rules = useServiceCharges();
  const update = useUpdateServiceCharge();
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Server percentages keyed by channel, defaulting missing channels to 0.
  const serverValues = useMemo(() => {
    const map: Record<string, number> = {};
    for (const ch of CHANNELS) map[ch] = 0;
    for (const r of rules.data ?? []) map[r.channel] = r.percentage;
    return map;
  }, [rules.data]);

  if (rules.isLoading) return <FullscreenSpinner label="Loading settings…" />;

  const current = values ?? Object.fromEntries(CHANNELS.map((ch) => [ch, String(serverValues[ch])]));
  const dirty = CHANNELS.filter((ch) => Number(current[ch]) !== serverValues[ch]);

  const setChannel = (ch: Channel, v: string) => {
    setSavedAt(null);
    setValues({ ...current, [ch]: v });
  };

  const save = async () => {
    setError(null);
    // Validate all dirty channels before sending anything.
    for (const ch of dirty) {
      const n = Number(current[ch]);
      if (Number.isNaN(n) || n < 0 || n > 100) {
        setError(`${CHANNEL_LABELS[ch]}: percentage must be between 0 and 100.`);
        return;
      }
    }
    try {
      for (const ch of dirty) {
        await update.mutateAsync({ channel: ch, percentage: Number(current[ch]) });
      }
      setValues(null);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save service charges');
    }
  };

  return (
    <AdminPage title="Settings" subtitle="Service-charge rules and system configuration.">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard
            title="Service charge by channel"
            description="Applied to the bill subtotal at payment time. Set 0% where no service charge applies."
          >
            <div className="space-y-3 p-4">
              {CHANNELS.map((ch) => (
                <div key={ch} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-800">{CHANNEL_LABELS[ch]}</div>
                    {(ch === 'dine_in_bar' || ch === 'takeaway') && serverValues[ch] === 0 ? (
                      <div className="text-xs text-slate-400">0% by default (spec §2.5)</div>
                    ) : null}
                  </div>
                  <div className="relative w-32">
                    <input
                      className={`${inputClass} pr-8 text-right`}
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={current[ch]}
                      onChange={(e) => setChannel(ch, e.target.value)}
                      aria-label={`${CHANNEL_LABELS[ch]} service charge percentage`}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                      %
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
              <div className="text-sm">
                {error ? (
                  <ErrorNote message={error} />
                ) : savedAt ? (
                  <span className="font-medium text-emerald-600">Saved.</span>
                ) : dirty.length > 0 ? (
                  <span className="text-slate-400">
                    {dirty.length} unsaved change{dirty.length === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span className="text-slate-400">All changes saved.</span>
                )}
              </div>
              <Button onClick={save} disabled={dirty.length === 0 || update.isPending}>
                {update.isPending ? <Spinner /> : 'Save changes'}
              </Button>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Currency">
            <div className="p-4">
              <StatCard label="Display currency" value={`${DEFAULT_CURRENCY_SYMBOL}  ·  ${DEFAULT_CURRENCY_CODE}`} />
              <p className="mt-3 text-xs text-slate-400">
                Currency is a fixed system constant. All prices, bills and reports render in {DEFAULT_CURRENCY_SYMBOL}.
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Printer routing">
            <div className="p-4 text-sm text-slate-500">
              KOTs route to a station printer (Kitchen / Bar) based on each menu item&apos;s station. Manage printers
              and their health on the{' '}
              <a href="/admin/printers" className="font-semibold text-brand-700 hover:underline">
                Printers
              </a>{' '}
              screen; set an item&apos;s station under{' '}
              <a href="/admin/menu" className="font-semibold text-brand-700 hover:underline">
                Menu &amp; recipes
              </a>
              .
            </div>
          </SectionCard>
        </div>
      </div>
    </AdminPage>
  );
}
