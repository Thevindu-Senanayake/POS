'use client';

import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Max width class for the card. */
  widthClassName?: string;
}

/**
 * Minimal accessible modal: backdrop + centered card, Escape and backdrop-click
 * to dismiss, body scroll locked while open. No portal — it's rendered from a
 * single top-level provider, so a fixed overlay is enough.
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('w-full rounded-2xl bg-white p-5 shadow-xl', widthClassName)}
      >
        {title ? <h2 className="mb-4 text-lg font-bold text-slate-900">{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}
