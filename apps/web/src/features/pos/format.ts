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
  { label: string; tile: string; dot: string; icon: string }
> = {
  free: {
    label: 'Free',
    tile: 'border-brand-200 bg-gradient-to-br from-brand-50 to-white hover:from-brand-100 text-brand-900 ring-1 ring-brand-100',
    dot: 'bg-brand-500',
    icon: '🪑',
  },
  occupied: {
    label: 'Occupied',
    tile: 'border-accent-300 bg-gradient-to-br from-accent-50 to-white hover:from-accent-100 text-accent-800 ring-1 ring-accent-100',
    dot: 'bg-accent-500',
    icon: '🍽️',
  },
  reserved: {
    label: 'Reserved',
    tile: 'border-purple-200 bg-gradient-to-br from-purple-50 to-white hover:from-purple-100 text-purple-900 ring-1 ring-purple-100',
    dot: 'bg-purple-500',
    icon: '📅',
  },
  needs_cleaning: {
    label: 'Needs cleaning',
    tile: 'border-stone-300 bg-gradient-to-br from-stone-100 to-white hover:from-stone-200 text-stone-600 ring-1 ring-stone-200',
    dot: 'bg-stone-400',
    icon: '🧹',
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
  draft: { label: 'Draft', badge: 'bg-sand-100 text-slate-600 ring-1 ring-sand-200' },
  sent_to_kitchen: { label: 'In kitchen', badge: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200' },
  served: { label: 'Served', badge: 'bg-brand-100 text-brand-800 ring-1 ring-brand-200' },
  cancelled: { label: 'Voided', badge: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200' },
};

/** Order statuses from which a bill can still be taken (stock already deducted). */
export const PAYABLE_STATUSES: OrderStatus[] = ['sent_to_kitchen', 'served', 'bill_requested'];
