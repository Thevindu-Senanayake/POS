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
  // Everything under `['bookings']` so a single realtime invalidation refreshes
  // every booking view (lists, per-room lookup, single booking).
  bookings: (status?: string) => ['bookings', 'list', status ?? 'all'] as const,
  bookingsForRoom: (roomId: string) => ['bookings', 'room', roomId] as const,
  booking: (id: string) => ['bookings', 'id', id] as const,
  rooms: ['rooms'] as const,
  room: (id: string) => ['rooms', id] as const,
  roomCategories: ['room-categories'] as const,
  ingredients: ['ingredients'] as const,
  printers: ['printers'] as const,
} as const;
