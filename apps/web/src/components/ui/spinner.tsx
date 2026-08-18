import { cn } from '@/lib/cn';

/** Indeterminate spinner. Inherits color via `currentColor`. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-5 w-5 animate-spin text-current', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

/** Full-viewport centered spinner with an optional label (route/auth loading states). */
export function FullscreenSpinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-slate-500">
      <Spinner className="h-8 w-8 text-brand-600" />
      {label ? <p className="text-sm font-medium">{label}</p> : null}
    </div>
  );
}
