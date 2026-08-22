'use client';

import { cn } from '../../lib/cn';
import { useRealtime } from './realtime-provider';

/** Small live/offline pill for the app header (spec §1 realtime board). */
export function RealtimeIndicator() {
  const { connected } = useRealtime();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        connected ? 'bg-emerald-50 text-emerald-700' : 'bg-sand-100 text-slate-500',
      )}
      title={connected ? 'Realtime connected' : 'Realtime disconnected - reconnecting'}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          connected ? 'bg-emerald-500' : 'animate-pulse bg-slate-400',
        )}
      />
      {connected ? 'Live' : 'Offline'}
    </span>
  );
}
