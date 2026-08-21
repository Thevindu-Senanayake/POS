import { z } from 'zod';

// Enum values MUST match the Prisma schema (packages/db/prisma/schema.prisma).
// Keep this file and schema.prisma in lockstep whenever either enum changes.

export const UserRoleSchema = z.enum([
  'admin',
  'cashier',
  'waiter',
  'bartender',
  'kitchen_staff',
  'room_service_staff',
]);
export type UserRole = z.infer<typeof UserRoleSchema>;
export const USER_ROLES = UserRoleSchema.options;

export const BaseUnitSchema = z.enum(['g', 'ml', 'pcs']);
export type BaseUnit = z.infer<typeof BaseUnitSchema>;
export const BASE_UNITS = BaseUnitSchema.options;

// Which side of the operation an ingredient stocks for: `bar` (spirits, wine,
// mixers) vs `restaurant` (kitchen raw materials). Splits the inventory screen.
export const IngredientDepartmentSchema = z.enum(['bar', 'restaurant']);
export type IngredientDepartment = z.infer<typeof IngredientDepartmentSchema>;
export const INGREDIENT_DEPARTMENTS = IngredientDepartmentSchema.options;

export const StockReasonSchema = z.enum([
  'purchase',
  'sale',
  'wastage',
  'adjustment',
  'return',
]);
export type StockReason = z.infer<typeof StockReasonSchema>;

export const StockRefTypeSchema = z.enum(['order_item', 'purchase_order', 'manual']);
export type StockRefType = z.infer<typeof StockRefTypeSchema>;

export const PurchaseOrderStatusSchema = z.enum(['draft', 'received']);
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatusSchema>;

export const MenuCategorySchema = z.enum(['food', 'bar', 'room_service']);
export type MenuCategory = z.infer<typeof MenuCategorySchema>;
export const MENU_CATEGORIES = MenuCategorySchema.options;

export const StationSchema = z.enum(['kitchen', 'bar']);
export type Station = z.infer<typeof StationSchema>;
export const STATIONS = StationSchema.options;

export const ChannelSchema = z.enum([
  'dine_in_restaurant',
  'dine_in_bar',
  'takeaway',
  'room_service',
]);
export type Channel = z.infer<typeof ChannelSchema>;
export const CHANNELS = ChannelSchema.options;

export const OrderStatusSchema = z.enum([
  'draft',
  'sent_to_kitchen',
  'served',
  'bill_requested',
  'paid',
  'cancelled',
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderItemStatusSchema = z.enum([
  'draft',
  'sent_to_kitchen',
  'served',
  'cancelled',
]);
export type OrderItemStatus = z.infer<typeof OrderItemStatusSchema>;

export const TableAreaSchema = z.enum(['restaurant', 'bar']);
export type TableArea = z.infer<typeof TableAreaSchema>;
export const TABLE_AREAS = TableAreaSchema.options;

export const TableStatusSchema = z.enum(['free', 'occupied', 'reserved', 'needs_cleaning']);
export type TableStatus = z.infer<typeof TableStatusSchema>;
export const TABLE_STATUSES = TableStatusSchema.options;

export const RoomStatusSchema = z.enum(['vacant', 'occupied', 'maintenance']);
export type RoomStatus = z.infer<typeof RoomStatusSchema>;
export const ROOM_STATUSES = RoomStatusSchema.options;

export const BoardPlanSchema = z.enum([
  'room_only',
  'bed_breakfast',
  'half_board',
  'full_board',
]);
export type BoardPlan = z.infer<typeof BoardPlanSchema>;
export const BOARD_PLANS = BoardPlanSchema.options;

export const BookingStatusSchema = z.enum([
  'reserved',
  'checked_in',
  'checked_out',
  'cancelled',
]);
export type BookingStatus = z.infer<typeof BookingStatusSchema>;
export const BOOKING_STATUSES = BookingStatusSchema.options;

export const FolioSourceSchema = z.enum([
  'room_service_order',
  'restaurant_order',
  'bar_order',
  'room_rate',
  'misc',
]);
export type FolioSource = z.infer<typeof FolioSourceSchema>;
export const FOLIO_SOURCES = FolioSourceSchema.options;

export const PaymentMethodSchema = z.enum(['cash', 'card', 'charge_to_room']);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
export const PAYMENT_METHODS = PaymentMethodSchema.options;

export const PrintJobTypeSchema = z.enum(['kot', 'bill']);
export type PrintJobType = z.infer<typeof PrintJobTypeSchema>;

export const PrintJobStatusSchema = z.enum(['pending', 'printing', 'done', 'failed']);
export type PrintJobStatus = z.infer<typeof PrintJobStatusSchema>;

export const DiscountTypeSchema = z.enum(['percentage', 'flat']);
export type DiscountType = z.infer<typeof DiscountTypeSchema>;

export const DiscountScopeSchema = z.enum(['order', 'line']);
export type DiscountScope = z.infer<typeof DiscountScopeSchema>;

export const AuditActionSchema = z.enum([
  'void_order',
  'void_item',
  'cancel_order',
  'discount_applied',
  'price_override',
  'split_bill',
  'merge_table',
  'transfer_table',
  'pin_override',
  'goods_received',
]);
export type AuditAction = z.infer<typeof AuditActionSchema>;

// Which physical printer a job routes to (spec §3.2). `receipt` is the
// station-less customer bill/receipt printer; `kitchen`/`bar` are the KOTs.
export const PrinterRoleSchema = z.enum(['kitchen', 'bar', 'receipt']);
export type PrinterRole = z.infer<typeof PrinterRoleSchema>;
export const PRINTER_ROLES = PrinterRoleSchema.options;

// How the agent reaches a printer: `network` = TCP (ip:port), `usb` = the host
// OS spooler / installed printer addressed by name (`device`).
export const PrinterConnectionSchema = z.enum(['network', 'usb']);
export type PrinterConnection = z.infer<typeof PrinterConnectionSchema>;
export const PRINTER_CONNECTIONS = PrinterConnectionSchema.options;

/** Which station a menu category defaults to for KOT routing. */
export const CATEGORY_DEFAULT_STATION: Record<MenuCategory, Station> = {
  food: 'kitchen',
  bar: 'bar',
  room_service: 'kitchen',
};
