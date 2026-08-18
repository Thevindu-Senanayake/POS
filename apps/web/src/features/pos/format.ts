import type {
  Channel,
  OrderItemStatus,
  OrderStatus,
  TableArea,
  TableStatus,
} from '@pos/shared';

/** Which order channel a table's area maps to (spec §2.3 dine-in split). */
export function channelForArea(area: TableArea): Channel {
  return area === 'bar' ? 'dine_in_bar' : 'dine_in_restaurant';
}

export const CHANNEL_LABELS: Record<Channel, string> = {
  dine_in_restaurant: 'Restaurant',
  dine_in_bar: 'Bar',
  takeaway: 'Takeaway',
  room_service: 'Room Service',
};

export const AREA_LABELS: Record<TableArea, string> = {
  restaurant: 'Restaurant',
  bar: 'Bar',
};

/** Tile styling per table status for the floor board (spec §1 status board). */
export const TABLE_STATUS_STYLES: Record<
  TableStatus,
  { label: string; tile: string; dot: string }
> = {
  free: {
    label: 'Free',
    tile: 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900',
    dot: 'bg-emerald-500',
  },
  occupied: {
    label: 'Occupied',
    tile: 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900',
    dot: 'bg-amber-500',
  },
  reserved: {
    label: 'Reserved',
    tile: 'border-violet-300 bg-violet-50 hover:bg-violet-100 text-violet-900',
    dot: 'bg-violet-500',
  },
  needs_cleaning: {
    label: 'Needs cleaning',
    tile: 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-600',
    dot: 'bg-slate-400',
  },
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Draft',
  sent_to_kitchen: 'Sent',
  served: 'Served',
  bill_requested: 'Bill requested',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

/** Badge styling for a fired order line's status. */
export const ITEM_STATUS_STYLES: Record<OrderItemStatus, { label: string; badge: string }> = {
  draft: { label: 'Draft', badge: 'bg-slate-100 text-slate-600' },
  sent_to_kitchen: { label: 'In kitchen', badge: 'bg-sky-100 text-sky-700' },
  served: { label: 'Served', badge: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Voided', badge: 'bg-red-100 text-red-700' },
};

/** Order statuses from which a bill can still be taken (stock already deducted). */
export const PAYABLE_STATUSES: OrderStatus[] = ['sent_to_kitchen', 'served', 'bill_requested'];
