'use client';

import { forwardRef, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Standard admin page frame: centered column with a header row. */
export function AdminPage({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{title}</h1>
          {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** A titled white card used to group a table or form. */
export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('card overflow-hidden', className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-200 bg-sand-50/60 px-4 py-3">
          <div>
            {title ? <h2 className="text-base font-bold text-slate-900">{title}</h2> : null}
            {description ? <p className="text-xs text-slate-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

const STAT_TONES = {
  default: { text: 'text-slate-900', strip: 'bg-sand-300' },
  brand: { text: 'text-brand-700', strip: 'bg-brand-gradient' },
  warn: { text: 'text-accent-600', strip: 'bg-accent-gradient' },
  danger: { text: 'text-red-600', strip: 'bg-red-400' },
  ok: { text: 'text-brand-600', strip: 'bg-brand-400' },
} as const;

/** Dashboard KPI tile. */
export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: keyof typeof STAT_TONES;
}) {
  const t = STAT_TONES[tone];
  return (
    <div className="card relative overflow-hidden p-4 transition-shadow hover:shadow-card-hover">
      <span className={cn('absolute inset-y-0 left-0 w-1', t.strip)} />
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={cn('mt-1 text-2xl font-extrabold', t.text)}>{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

export interface Column<T> {
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

/** Generic, touch-friendly data table with a built-in empty state. */
export function Table<T>({
  columns,
  rows,
  keyOf,
  empty = 'Nothing here yet.',
}: {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  empty?: ReactNode;
}) {
  if (rows.length === 0) {
    return <div className="px-4 py-10 text-center text-sm text-slate-400">{empty}</div>;
  }
  const alignClass = (a?: 'left' | 'right' | 'center') =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-sand-200 bg-sand-50/60 text-xs uppercase tracking-wide text-slate-500">
            {columns.map((c, i) => (
              <th key={i} className={cn('px-4 py-2.5 font-semibold', alignClass(c.align))}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-100">
          {rows.map((row) => (
            <tr key={keyOf(row)} className="transition-colors hover:bg-brand-50/40">
              {columns.map((c, i) => (
                <td key={i} className={cn('px-4 py-3 text-slate-800', alignClass(c.align), c.className)}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const BADGE_TONES = {
  slate: 'bg-sand-100 text-slate-700 ring-1 ring-sand-200',
  brand: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200',
  teal: 'bg-brand-100 text-brand-800 ring-1 ring-brand-200',
  gold: 'bg-accent-100 text-accent-700 ring-1 ring-accent-200',
  green: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
  amber: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
  red: 'bg-red-100 text-red-700 ring-1 ring-red-200',
} as const;

export function Badge({
  children,
  tone = 'slate',
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
}) {
  return (
    <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-bold', BADGE_TONES[tone])}>
      {children}
    </span>
  );
}

// --- Form primitives (work with react-hook-form register spread) -------------

export const inputClass =
  'w-full rounded-xl border border-sand-300 bg-white px-3 py-2.5 text-base outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-sand-50';

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-semibold text-slate-700">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...props }, ref) {
    return <input ref={ref} className={cn(inputClass, className)} {...props} />;
  },
);

export const SelectInput = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function SelectInput({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(inputClass, className)} {...props}>
        {children}
      </select>
    );
  },
);

/** Inline error banner shared by admin forms/mutations. */
export function ErrorNote({ message }: { message?: string | null }) {
  return message ? (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{message}</p>
  ) : null;
}
