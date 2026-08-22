'use client';

import { useEffect, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Max width class for the card. */
  widthClassName?: string;
}

/**
 * Minimal accessible modal: blurred backdrop + centered card with a gold top
 * hairline and a close button. Escape and backdrop-click dismiss, body scroll
 * locked while open. No portal — it's rendered from a single top-level
 * provider, so a fixed overlay is enough.
 */
export function Modal({ open, onClose, title, children, widthClassName = 'max-w-sm' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative w-full overflow-hidden rounded-2xl bg-white shadow-card-hover ring-1 ring-sand-200 motion-safe:animate-scale-in',
          widthClassName,
        )}
      >
        {/* Gold accent hairline across the top edge. */}
        <div className="h-1 w-full bg-accent-gradient" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-sand-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        >
          ✕
        </button>
        <div className="p-5">
          {title ? (
            <h2 className="mb-4 pr-8 text-lg font-extrabold tracking-tight text-slate-900">{title}</h2>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
