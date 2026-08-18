import type {
  AuditAction,
  BaseUnit,
  Channel,
  MenuCategory,
  PaymentMethod,
  PurchaseOrderStatus,
  RoomStatus,
  StockReason,
  Station,
  UserRole,
} from '@pos/shared';

/** Human labels + badge tones for the enums surfaced across the admin screens. */

export const BASE_UNIT_LABELS: Record<BaseUnit, string> = {
  g: 'grams (g)',
  ml: 'millilitres (ml)',
  pcs: 'pieces (pcs)',
};

/** Short unit suffix for inline display (e.g. "1,200 g"). */
export const BASE_UNIT_SHORT: Record<BaseUnit, string> = { g: 'g', ml: 'ml', pcs: 'pcs' };

export const STOCK_REASON_LABELS: Record<StockReason, string> = {
  purchase: 'Purchase',
  sale: 'Sale',
  wastage: 'Wastage',
  adjustment: 'Adjustment',
  return: 'Return / void',
};

export const STOCK_REASON_TONE: Record<StockReason, 'green' | 'red' | 'amber' | 'slate' | 'brand'> = {
  purchase: 'green',
  sale: 'slate',
  wastage: 'red',
  adjustment: 'amber',
  return: 'brand',
};

export const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  received: 'Received',
};

export const PO_STATUS_TONE: Record<PurchaseOrderStatus, 'amber' | 'green'> = {
  draft: 'amber',
  received: 'green',
};

export const MENU_CATEGORY_LABELS: Record<MenuCategory, string> = {
  food: 'Food',
  bar: 'Bar',
  room_service: 'Room service',
};

export const STATION_LABELS: Record<Station, string> = {
  kitchen: 'Kitchen',
  bar: 'Bar',
};

export const ROOM_STATUS_LABELS: Record<RoomStatus, string> = {
  vacant: 'Vacant',
  occupied: 'Occupied',
  maintenance: 'Maintenance',
};

export const ROOM_STATUS_TONE: Record<RoomStatus, 'green' | 'brand' | 'amber'> = {
  vacant: 'green',
  occupied: 'brand',
  maintenance: 'amber',
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  cashier: 'Cashier',
  waiter: 'Waiter',
  bartender: 'Bartender',
  kitchen_staff: 'Kitchen staff',
  room_service_staff: 'Room-service staff',
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  dine_in_restaurant: 'Dine-in · Restaurant',
  dine_in_bar: 'Dine-in · Bar',
  takeaway: 'Takeaway',
  room_service: 'Room service',
};

/** Compact channel label for tight table headers. */
export const CHANNEL_SHORT: Record<Channel, string> = {
  dine_in_restaurant: 'Restaurant',
  dine_in_bar: 'Bar',
  takeaway: 'Takeaway',
  room_service: 'Room svc',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  charge_to_room: 'Charge to room',
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  void_order: 'Voided order',
  void_item: 'Voided item',
  cancel_order: 'Cancelled order',
  discount_applied: 'Applied discount',
  price_override: 'Price override',
  split_bill: 'Split bill',
  merge_table: 'Merged table',
  transfer_table: 'Transferred table',
  pin_override: 'Manager PIN override',
  goods_received: 'Goods received',
};

export const AUDIT_ACTION_TONE: Record<AuditAction, 'red' | 'amber' | 'slate' | 'green' | 'brand'> = {
  void_order: 'red',
  void_item: 'red',
  cancel_order: 'red',
  discount_applied: 'amber',
  price_override: 'amber',
  split_bill: 'brand',
  merge_table: 'brand',
  transfer_table: 'brand',
  pin_override: 'amber',
  goods_received: 'green',
};

/** ISO timestamp → "18 Aug 2026, 14:05" for audit/ledger rows. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** ISO date → "18 Aug 2026". */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** A signed stock quantity with its unit, e.g. "+1,200 g" / "-30 ml". */
export function formatQty(qty: number, unit: BaseUnit, signed = false): string {
  const sign = signed && qty > 0 ? '+' : '';
  return `${sign}${qty.toLocaleString('en-US')} ${BASE_UNIT_SHORT[unit]}`;
}
