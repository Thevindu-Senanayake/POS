/**
 * Central TanStack Query keys. Keys are hierarchical so a broad
 * `invalidateQueries({ queryKey: qk.tables })` also invalidates a single
 * `qk.table(id)`, and `['orders']` covers both an order and its bills. The
 * realtime layer and the POS mutations invalidate by these prefixes.
 */
export const qk = {
  tables: ['tables'] as const,
  table: (id: string) => ['tables', id] as const,
  sessions: ['sessions'] as const,
  session: (id: string) => ['sessions', id] as const,
  menu: ['menu'] as const,
  order: (id: string) => ['orders', id] as const,
  bills: (orderId: string) => ['orders', orderId, 'bills'] as const,
  serviceCharges: ['service-charges'] as const,
  bookings: (status?: string) => ['bookings', status ?? 'all'] as const,
  rooms: ['rooms'] as const,
  ingredients: ['ingredients'] as const,
  printers: ['printers'] as const,
} as const;
