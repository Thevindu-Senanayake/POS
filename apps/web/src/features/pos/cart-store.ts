'use client';

import { create } from 'zustand';

/** A line being composed locally before it's sent to the kitchen/bar. */
export interface CartLine {
  menuItemId: string;
  name: string;
  unitPrice: number;
  qty: number;
  notes: string;
}

interface CartState {
  /** Carts keyed by a stable screen key (`table:<id>` or `order:<id>`). */
  carts: Record<string, CartLine[]>;
  add: (key: string, line: Omit<CartLine, 'qty' | 'notes'>) => void;
  inc: (key: string, index: number) => void;
  dec: (key: string, index: number) => void;
  setNotes: (key: string, index: number, notes: string) => void;
  remove: (key: string, index: number) => void;
  clear: (key: string) => void;
}

/**
 * The compose cart holds the *current round* of items before it's committed
 * (persisted as draft lines + fired) in one action. Tapping a menu item merges
 * into an existing note-free line so repeated taps bump quantity; a line that
 * has been given notes stays distinct. Operations are by array index to avoid
 * key collisions between same-item lines with different notes.
 *
 * Kept in memory only — the offline-durable queue is a later milestone (§9).
 */
export const useCartStore = create<CartState>((set) => ({
  carts: {},
  add: (key, line) =>
    set((state) => {
      const cart = state.carts[key] ?? [];
      const idx = cart.findIndex((l) => l.menuItemId === line.menuItemId && l.notes === '');
      const next =
        idx >= 0
          ? cart.map((l, i) => (i === idx ? { ...l, qty: l.qty + 1 } : l))
          : [...cart, { ...line, qty: 1, notes: '' }];
      return { carts: { ...state.carts, [key]: next } };
    }),
  inc: (key, index) =>
    set((state) => ({
      carts: {
        ...state.carts,
        [key]: (state.carts[key] ?? []).map((l, i) =>
          i === index ? { ...l, qty: l.qty + 1 } : l,
        ),
      },
    })),
  dec: (key, index) =>
    set((state) => {
      const cart = state.carts[key] ?? [];
      const next = cart
        .map((l, i) => (i === index ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0);
      return { carts: { ...state.carts, [key]: next } };
    }),
  setNotes: (key, index, notes) =>
    set((state) => ({
      carts: {
        ...state.carts,
        [key]: (state.carts[key] ?? []).map((l, i) => (i === index ? { ...l, notes } : l)),
      },
    })),
  remove: (key, index) =>
    set((state) => ({
      carts: {
        ...state.carts,
        [key]: (state.carts[key] ?? []).filter((_, i) => i !== index),
      },
    })),
  clear: (key) =>
    set((state) => {
      const { [key]: _drop, ...rest } = state.carts;
      return { carts: rest };
    }),
}));
