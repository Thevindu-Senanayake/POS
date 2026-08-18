import type { BoardPlan, BookingStatus, FolioSource, RoomStatus } from '@pos/shared';

/** Tile styling per room status for the room board (spec §1/§5 status board). */
export const ROOM_STATUS_STYLES: Record<
  RoomStatus,
  { label: string; tile: string; dot: string; badge: string }
> = {
  vacant: {
    label: 'Vacant',
    tile: 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  occupied: {
    label: 'Occupied',
    tile: 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900',
    dot: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-700',
  },
  maintenance: {
    label: 'Maintenance',
    tile: 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-600',
    dot: 'bg-slate-400',
    badge: 'bg-slate-200 text-slate-600',
  },
};

export const BOARD_PLAN_LABELS: Record<BoardPlan, string> = {
  room_only: 'Room only',
  bed_breakfast: 'Bed & breakfast',
  half_board: 'Half board',
  full_board: 'Full board',
};

/** A board plan that covers room-service meals (comp on the folio, spec §2.7). */
export function boardPlanCoversMeals(plan: BoardPlan): boolean {
  return plan === 'half_board' || plan === 'full_board';
}

export const BOOKING_STATUS_STYLES: Record<BookingStatus, { label: string; badge: string }> = {
  reserved: { label: 'Reserved', badge: 'bg-violet-100 text-violet-700' },
  checked_in: { label: 'Checked in', badge: 'bg-emerald-100 text-emerald-700' },
  checked_out: { label: 'Checked out', badge: 'bg-slate-200 text-slate-600' },
  cancelled: { label: 'Cancelled', badge: 'bg-red-100 text-red-700' },
};

export const FOLIO_SOURCE_LABELS: Record<FolioSource, string> = {
  room_service_order: 'Room service',
  restaurant_order: 'Restaurant',
  bar_order: 'Bar',
  room_rate: 'Room rate',
  misc: 'Extra',
};

/** A booking is "active" (occupying the folio) while reserved or checked-in. */
export function isActiveBooking(status: BookingStatus): boolean {
  return status === 'reserved' || status === 'checked_in';
}

/** Short, locale-formatted calendar date for a stay (e.g. "18 Aug 2026"). */
export function formatStayDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** `YYYY-MM-DD` for seeding an `<input type="date">` from a Date. */
export function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}
