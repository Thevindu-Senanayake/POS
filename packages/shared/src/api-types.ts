import type {
  AuditAction,
  BaseUnit,
  BoardPlan,
  BookingStatus,
  Channel,
  DiscountScope,
  DiscountType,
  FolioSource,
  MenuCategory,
  OrderItemStatus,
  OrderStatus,
  PaymentMethod,
  PrintJobStatus,
  PrintJobType,
  PrinterConnection,
  PrinterRole,
  PurchaseOrderStatus,
  RoomStatus,
  Station,
  StockReason,
  StockRefType,
  TableArea,
  TableStatus,
  UserRole,
} from './enums.js';

// Serialized API response shapes. Money is a number (2dp), timestamps are ISO strings.

export interface AuthUserDTO {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  hasPin: boolean;
  isActive: boolean;
}

export interface LoginResponseDTO {
  accessToken: string;
  refreshToken: string;
  user: AuthUserDTO;
}

export interface IngredientDTO {
  id: string;
  name: string;
  baseUnit: BaseUnit;
  currentStock: number;
  reorderLevel: number;
  costPerUnit: number;
  supplierId: string | null;
  isActive: boolean;
  lowStock: boolean;
}

export interface StockMovementDTO {
  id: string;
  ingredientId: string;
  ingredientName?: string;
  changeQty: number;
  reason: StockReason;
  refType: StockRefType;
  refId: string | null;
  unitCostAtTime: number | null;
  note: string | null;
  createdAt: string;
}

export interface SupplierDTO {
  id: string;
  name: string;
  contactInfo: string | null;
  phone: string | null;
  email: string | null;
}

export interface PurchaseOrderItemDTO {
  id: string;
  ingredientId: string;
  ingredientName?: string;
  qty: number;
  unitCost: number;
  batchRef: string | null;
}

export interface PurchaseOrderDTO {
  id: string;
  supplierId: string;
  supplierName?: string;
  status: PurchaseOrderStatus;
  reference: string | null;
  orderedAt: string;
  receivedAt: string | null;
  items: PurchaseOrderItemDTO[];
  total: number;
}

export interface MenuItemPriceDTO {
  channel: Channel;
  price: number;
}

export interface MenuItemDTO {
  id: string;
  name: string;
  category: MenuCategory;
  station: Station;
  isActive: boolean;
  prices: MenuItemPriceDTO[];
}

export interface RecipeDTO {
  id: string;
  menuItemId: string;
  ingredientId: string;
  ingredientName?: string;
  quantity: number;
  notes: string | null;
}

export interface ServiceChargeRuleDTO {
  channel: Channel;
  percentage: number;
}

export interface DiningTableDTO {
  id: string;
  area: TableArea;
  name: string;
  capacity: number;
  status: TableStatus;
  activeSessionId: string | null;
  activeOrderId: string | null;
}

export interface TableSessionDTO {
  id: string;
  tableId: string;
  tableName: string;
  area: TableArea;
  waiterId: string | null;
  openedAt: string;
  closedAt: string | null;
  orderIds: string[];
}

export interface OrderItemDTO {
  id: string;
  menuItemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  station: Station;
  status: OrderItemStatus;
  notes: string | null;
}

export interface DiscountDTO {
  id: string;
  scope: DiscountScope;
  type: DiscountType;
  value: number;
  amount: number;
  reason: string | null;
  orderItemId: string | null;
}

export interface OrderDTO {
  id: string;
  channel: Channel;
  status: OrderStatus;
  tableSessionId: string | null;
  bookingId: string | null;
  notes: string | null;
  items: OrderItemDTO[];
  discounts: DiscountDTO[];
  subtotal: number;
  discountTotal: number;
  serviceCharge: number;
  total: number;
  createdAt: string;
}

export interface BillItemDTO {
  id: string;
  orderItemId: string | null;
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PaymentDTO {
  id: string;
  method: PaymentMethod;
  amount: number;
  reference: string | null;
  createdAt: string;
}

export interface BillDTO {
  id: string;
  orderId: string;
  label: string | null;
  items: BillItemDTO[];
  subtotal: number;
  discountTotal: number;
  serviceCharge: number;
  total: number;
  payments: PaymentDTO[];
  createdAt: string;
}

export interface RoomCategoryDTO {
  id: string;
  name: string;
  defaultRate: number;
}

export interface RoomDTO {
  id: string;
  roomNumber: string;
  roomCategoryId: string;
  categoryName?: string;
  rateOverride: number | null;
  effectiveRate: number;
  status: RoomStatus;
}

export interface FolioChargeDTO {
  id: string;
  source: FolioSource;
  description: string | null;
  amount: number;
  createdAt: string;
}

export interface BookingDTO {
  id: string;
  roomId: string;
  roomNumber?: string;
  guestName: string;
  guestPhone: string | null;
  checkIn: string;
  checkOut: string;
  boardPlan: BoardPlan;
  agreedRate: number;
  status: BookingStatus;
  nights: number;
  roomCharge: number;
  folioCharges: FolioChargeDTO[];
  folioTotal: number;
  grandTotal: number;
}

export interface PrintJobDTO {
  id: string;
  type: PrintJobType;
  station: Station | null;
  status: PrintJobStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  orderId: string | null;
  billId: string | null;
  nextAttemptAt: string;
  claimedBy: string | null;
  printedAt: string | null;
  createdAt: string;
}

/**
 * A claimed job as handed to the print-agent (spec §3): carries the render
 * `payload` (KOT or bill shape) the agent turns into ESC/POS. Distinct from
 * {@link PrintJobDTO}, which is the admin queue/health view without the payload.
 */
export interface PrintJobAgentDTO {
  id: string;
  type: PrintJobType;
  station: Station | null;
  attempts: number;
  maxAttempts: number;
  payload: unknown;
}

export interface PrinterDTO {
  id: string;
  role: PrinterRole;
  name: string;
  /** How the agent reaches it: `network` (ip:port) or `usb` (OS spooler by name). */
  connection: PrinterConnection;
  ip: string | null;
  port: number;
  /** usb: the OS spooler / installed-printer name the agent prints to. */
  device: string | null;
  /** ESC/POS profile the agent renders with (e.g. `epson`, `star`). */
  type: string;
  online: boolean;
  lastSeenAt: string | null;
  lastError: string | null;
}

export interface AuditLogDTO {
  id: string;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  actorName: string | null;
  approverName: string | null;
  createdAt: string;
}

// --- Reports (spec §5, §2.8) ---

export interface SalesReportRowDTO {
  key: string; // day / category / payment method / channel label
  orders: number;
  gross: number;
  discounts: number;
  serviceCharge: number;
  net: number;
}

export interface SalesReportDTO {
  from: string;
  to: string;
  groupBy: 'day' | 'category' | 'payment_method' | 'channel';
  rows: SalesReportRowDTO[];
  totals: Omit<SalesReportRowDTO, 'key'>;
}

export interface VarianceRowDTO {
  ingredientId: string;
  ingredientName: string;
  baseUnit: BaseUnit;
  purchased: number;
  theoreticalConsumption: number;
  actualConsumption: number;
  variance: number;
  varianceCost: number;
}

export interface LowStockRowDTO {
  ingredientId: string;
  ingredientName: string;
  baseUnit: BaseUnit;
  currentStock: number;
  reorderLevel: number;
  shortfall: number;
}

export interface DashboardSummaryDTO {
  tablesOccupied: number;
  tablesFree: number;
  roomsOccupied: number;
  roomsVacant: number;
  openOrders: number;
  salesToday: number;
  lowStockCount: number;
  printersOffline: number;
}

export interface ApiErrorDTO {
  statusCode: number;
  message: string | string[];
  error?: string;
}
