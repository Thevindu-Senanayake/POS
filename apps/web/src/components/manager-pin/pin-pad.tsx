'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
const MAX_LEN = 12;

/**
 * Touch-first numeric keypad for manager-PIN entry. Purely collects the digits
 * and hands them back via `onSubmit` — verification happens server-side on the
 * gated action (there is no separate verify endpoint), so a wrong PIN surfaces
 * as that action's 403 and the caller can re-prompt.
 */
export function PinPad({
  onSubmit,
  onCancel,
}: {
  onSubmit: (pin: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState('');

  const append = useCallback((d: string) => setPin((p) => (p.length < MAX_LEN ? p + d : p)), []);
  const backspace = useCallback(() => setPin((p) => p.slice(0, -1)), []);
  const submit = useCallback(() => {
    if (pin.length > 0) onSubmit(pin);
  }, [pin, onSubmit]);

  // Physical-keyboard support (desktop): digits, Backspace, Enter, Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') append(e.key);
      else if (e.key === 'Backspace') backspace();
      else if (e.key === 'Enter') submit();
      else if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [append, backspace, submit, onCancel]);

  return (
    <div>
      <div
        className={cn(
          'mb-4 flex h-14 items-center justify-center gap-2 rounded-xl border border-sand-300 bg-sand-50',
        )}
        aria-live="polite"
      >
        {pin.length === 0 ? (
          <span className="text-sm text-slate-400">Enter manager PIN</span>
        ) : (
          Array.from(pin).map((_, i) => (
            <span key={i} className="h-3.5 w-3.5 rounded-full bg-brand-600" />
          ))
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <Button key={k} variant="secondary" size="lg" className="text-xl" onClick={() => append(k)}>
            {k}
          </Button>
        ))}
        <Button variant="ghost" size="lg" onClick={() => setPin('')}>
          Clear
        </Button>
        <Button variant="secondary" size="lg" className="text-xl" onClick={() => append('0')}>
          0
        </Button>
        <Button variant="ghost" size="lg" aria-label="Backspace" onClick={backspace}>
          ⌫
        </Button>
      </div>

      <div className="mt-4 flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={submit} disabled={pin.length === 0}>
          Confirm
        </Button>
      </div>
    </div>
  );
}
