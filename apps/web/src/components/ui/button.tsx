import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size = 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-gradient text-white shadow-card hover:brightness-[1.06] active:brightness-95 disabled:opacity-50 disabled:shadow-none',
  accent:
    'bg-accent-gradient text-white shadow-card hover:brightness-[1.06] active:brightness-95 disabled:opacity-50 disabled:shadow-none',
  secondary:
    'bg-white text-slate-800 border border-sand-300 shadow-sm hover:bg-sand-50 hover:border-sand-400 active:bg-sand-100 disabled:opacity-50',
  ghost: 'bg-transparent text-slate-700 hover:bg-sand-200/70 active:bg-sand-200 disabled:opacity-50',
  danger:
    'bg-red-600 text-white shadow-card hover:bg-red-700 active:bg-red-800 disabled:bg-red-300 disabled:shadow-none',
};

const SIZES: Record<Size, string> = {
  md: 'min-h-touch px-4 text-sm',
  lg: 'min-h-[56px] px-6 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/** Touch-first button: min 44px hit target, clear pressed states, focus ring. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition-all',
        'motion-safe:active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-sand-50',
        'disabled:cursor-not-allowed disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});
