'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  AuditLogDTO,
  AuthUserDTO,
  BaseUnit,
  Channel,
  DashboardSummaryDTO,
  DiningTableDTO,
  IngredientDepartment,
  IngredientDTO,
  LowStockRowDTO,
  MenuCategory,
  MenuItemDTO,
  OutletDTO,
  PrinterDTO,
  PrintJobDTO,
  PurchaseOrderDTO,
  RecipeDTO,
  RoomCategoryDTO,
  RoomDTO,
  RoomStatus,
  SalesReportDTO,
  ServiceChargeRuleDTO,
  Station,
  StockMovementDTO,
  SupplierDTO,
  TableArea,
  TableStatus,
  UserRole,
  VarianceRowDTO,
} from '@pos/shared';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

// =============================================================================
// Request payload shapes (mirror the api DTOs, apps/api/src/modules/**)
// =============================================================================

export interface IngredientInput {
  name: string;
  baseUnit: BaseUnit;
  department: IngredientDepartment;
  reorderLevel?: number;
  costPerUnit?: number;
  supplierId?: string | null;
  openingStock?: number;
}
export interface TableInput {
  area: TableArea;
  name: string;
  capacity?: number;
  status?: TableStatus;
}
export interface AdjustStockInput {
  changeQty: number;
  reason: 'adjustment' | 'wastage' | 'return';
  note?: string;
}
export interface SupplierInput {
  name: string;
  contactInfo?: string;
  phone?: string;
  email?: string;
}
export interface PurchaseOrderItemInput {
  ingredientId: string;
  qty: number;
  unitCost: number;
  batchRef?: string;
}
export interface PurchaseOrderInput {
  supplierId: string;
  reference?: string;
  items: PurchaseOrderItemInput[];
}
export interface MenuItemPriceInput {
  channel: Channel;
  price: number;
}
export interface MenuItemInput {
  name: string;
  category: MenuCategory;
  station?: Station;
  prices?: MenuItemPriceInput[];
}
export interface RecipeLineInput {
  ingredientId: string;
  quantity: number;
  notes?: string;
}
export interface RoomInput {
  roomNumber: string;
  roomCategoryId: string;
  rateOverride?: number | null;
  status?: RoomStatus;
}
export interface RoomCategoryInput {
  name: string;
  defaultRate: number;
}
export interface PrinterInput {
  name?: string;
  connection?: 'network' | 'usb';
  ip?: string | null;
  port?: number;
  device?: string | null;
  type?: string;
  online?: boolean;
}
export interface UserInput {
  name: string;
  username: string;
  password: string;
  role: UserRole;
  pin?: string;
  isActive?: boolean;
}
export interface UserPatch {
  name?: string;
  username?: string;
  password?: string;
  role?: UserRole;
  isActive?: boolean;
}
/** Partial update of the outlet identity + receipt customisation (PUT /outlet). */
export interface OutletInput {
  name?: string;
  address?: string | null;
  phone?: string | null;
  tagline?: string | null;
  taxNumber?: string | null;
  receiptFooter?: string | null;
  receiptCurrencyLabel?: string | null;
  showName?: boolean;
  showTagline?: boolean;
  showAddress?: boolean;
  showPhone?: boolean;
  showTaxNumber?: boolean;
  showFooter?: boolean;
  showCurrencyLabel?: boolean;
}

// =============================================================================
// Reads
// =============================================================================

export function useDashboard() {
  return useQuery({
    queryKey: qk.dashboard,
    queryFn: () => api.get<DashboardSummaryDTO>('/reports/dashboard'),
    refetchInterval: 30_000,
  });
}

export function useIngredients(includeInactive = false) {
  return useQuery({
    queryKey: [...qk.ingredients, { includeInactive }],
    queryFn: () =>
      api.get<IngredientDTO[]>(`/ingredients${includeInactive ? '?includeInactive=true' : ''}`),
  });
}

export function useStockMovements(ingredientId: string | null) {
  return useQuery({
    queryKey: qk.stockMovements(ingredientId ?? 'none'),
    queryFn: () => api.get<StockMovementDTO[]>(`/ingredients/${ingredientId}/movements`),
    enabled: !!ingredientId,
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: qk.suppliers,
    queryFn: () => api.get<SupplierDTO[]>('/suppliers'),
  });
}

export function usePurchaseOrders(status?: 'draft' | 'received') {
  return useQuery({
    queryKey: [...qk.purchaseOrders, status ?? 'all'],
    queryFn: () => api.get<PurchaseOrderDTO[]>(`/purchase-orders${status ? `?status=${status}` : ''}`),
  });
}

export function useMenuItems(includeInactive = false) {
  return useQuery({
    queryKey: [...qk.menuItems, { includeInactive }],
    queryFn: () =>
      api.get<MenuItemDTO[]>(`/menu-items${includeInactive ? '?includeInactive=true' : ''}`),
  });
}

export function useRecipe(menuItemId: string | null) {
  return useQuery({
    queryKey: qk.recipe(menuItemId ?? 'none'),
    queryFn: () => api.get<RecipeDTO[]>(`/menu-items/${menuItemId}/recipe`),
    enabled: !!menuItemId,
  });
}

export function useServiceCharges() {
  return useQuery({
    queryKey: qk.serviceCharges,
    queryFn: () => api.get<ServiceChargeRuleDTO[]>('/service-charges'),
    staleTime: 5 * 60_000,
  });
}

export function useOutlet() {
  return useQuery({
    queryKey: qk.outlet,
    queryFn: () => api.get<OutletDTO>('/outlet'),
    staleTime: 5 * 60_000,
  });
}

export function usePrinters() {
  return useQuery({
    queryKey: qk.printers,
    queryFn: () => api.get<PrinterDTO[]>('/printing/printers'),
  });
}

export function usePrintJobs(status?: string) {
  return useQuery({
    queryKey: ['print-jobs', status ?? 'all'],
    queryFn: () => api.get<PrintJobDTO[]>(`/printing/jobs${status ? `?status=${status}` : ''}`),
    refetchInterval: 15_000,
  });
}

export function useUsers() {
  return useQuery({
    queryKey: qk.users,
    queryFn: () => api.get<AuthUserDTO[]>('/users'),
  });
}

export function useAuditLog(params: { action?: string; limit?: number }) {
  const q = new URLSearchParams();
  if (params.action) q.set('action', params.action);
  if (params.limit) q.set('limit', String(params.limit));
  const qs = q.toString();
  return useQuery({
    queryKey: qk.auditLogs(qs),
    queryFn: () => api.get<AuditLogDTO[]>(`/reports/audit${qs ? `?${qs}` : ''}`),
  });
}

export function useSalesReport(params: { from?: string; to?: string; groupBy: string }) {
  const q = new URLSearchParams();
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  q.set('groupBy', params.groupBy);
  const qs = q.toString();
  return useQuery({
    queryKey: qk.salesReport(qs),
    queryFn: () => api.get<SalesReportDTO>(`/reports/sales?${qs}`),
  });
}

export function useVarianceReport(params: { from?: string; to?: string }) {
  const q = new URLSearchParams();
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const qs = q.toString();
  return useQuery({
    queryKey: qk.varianceReport(qs),
    queryFn: () => api.get<VarianceRowDTO[]>(`/reports/variance${qs ? `?${qs}` : ''}`),
  });
}

export function useLowStock() {
  return useQuery({
    queryKey: qk.lowStockReport,
    queryFn: () => api.get<LowStockRowDTO[]>('/reports/low-stock'),
  });
}

// Rooms admin reuses the read hooks from the rooms feature.
export function useRooms() {
  return useQuery({ queryKey: qk.rooms, queryFn: () => api.get<RoomDTO[]>('/rooms') });
}
export function useRoomCategories() {
  return useQuery({
    queryKey: qk.roomCategories,
    queryFn: () => api.get<RoomCategoryDTO[]>('/room-categories'),
  });
}

// Tables admin reuses the POS floor read but under the admin cache key.
export function useTables() {
  return useQuery({ queryKey: qk.tables, queryFn: () => api.get<DiningTableDTO[]>('/tables') });
}

// =============================================================================
// Mutations — each invalidates the lists it can affect
// =============================================================================

/** Invalidate every ingredient view + low-stock/dashboard derived from stock. */
function invalidateStock(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.ingredients });
  void qc.invalidateQueries({ queryKey: qk.lowStockReport });
  void qc.invalidateQueries({ queryKey: qk.dashboard });
}

export function useCreateIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: IngredientInput) => api.post<IngredientDTO>('/ingredients', body),
    onSuccess: () => invalidateStock(qc),
  });
}
export function useUpdateIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: Partial<IngredientInput> & { isActive?: boolean } }) =>
      api.patch<IngredientDTO>(`/ingredients/${vars.id}`, vars.body),
    onSuccess: () => invalidateStock(qc),
  });
}
export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: AdjustStockInput }) =>
      api.post<IngredientDTO>(`/ingredients/${vars.id}/adjust`, vars.body),
    onSuccess: (_r, vars) => {
      invalidateStock(qc);
      void qc.invalidateQueries({ queryKey: qk.stockMovements(vars.id) });
    },
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SupplierInput) => api.post<SupplierDTO>('/suppliers', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.suppliers }),
  });
}
export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: Partial<SupplierInput> }) =>
      api.patch<SupplierDTO>(`/suppliers/${vars.id}`, vars.body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.suppliers }),
  });
}
export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/suppliers/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.suppliers }),
  });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PurchaseOrderInput) => api.post<PurchaseOrderDTO>('/purchase-orders', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.purchaseOrders }),
  });
}
export function useUpdatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: Partial<PurchaseOrderInput> }) =>
      api.patch<PurchaseOrderDTO>(`/purchase-orders/${vars.id}`, vars.body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.purchaseOrders }),
  });
}
export function useReceivePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<PurchaseOrderDTO>(`/purchase-orders/${id}/receive`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.purchaseOrders });
      invalidateStock(qc);
    },
  });
}
export function useDeletePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/purchase-orders/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.purchaseOrders }),
  });
}

/** Refresh both admin (with-inactive) and POS (active-only) menu caches. */
function invalidateMenu(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.menuItems });
  void qc.invalidateQueries({ queryKey: qk.menu });
}

export function useCreateMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MenuItemInput) => api.post<MenuItemDTO>('/menu-items', body),
    onSuccess: () => invalidateMenu(qc),
  });
}
export function useUpdateMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: Partial<MenuItemInput> & { isActive?: boolean } }) =>
      api.patch<MenuItemDTO>(`/menu-items/${vars.id}`, vars.body),
    onSuccess: () => invalidateMenu(qc),
  });
}
export function useSetPrices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; prices: MenuItemPriceInput[] }) =>
      api.put<MenuItemDTO>(`/menu-items/${vars.id}/prices`, { prices: vars.prices }),
    onSuccess: () => invalidateMenu(qc),
  });
}
export function useDeletePrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; channel: Channel }) =>
      api.del<void>(`/menu-items/${vars.id}/prices/${vars.channel}`),
    onSuccess: () => invalidateMenu(qc),
  });
}
export function useDeleteMenuItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/menu-items/${id}`),
    onSuccess: () => invalidateMenu(qc),
  });
}

export function useUpdateServiceCharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { channel: Channel; percentage: number }) =>
      api.put<ServiceChargeRuleDTO>(`/service-charges/${vars.channel}`, {
        percentage: vars.percentage,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.serviceCharges }),
  });
}

export function useUpdateOutlet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OutletInput) => api.put<OutletDTO>('/outlet', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.outlet }),
  });
}

export function useSetRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { menuItemId: string; items: RecipeLineInput[] }) =>
      api.put<RecipeDTO[]>(`/menu-items/${vars.menuItemId}/recipe`, { items: vars.items }),
    onSuccess: (_r, vars) => void qc.invalidateQueries({ queryKey: qk.recipe(vars.menuItemId) }),
  });
}
export function useDeleteRecipeLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { menuItemId: string; ingredientId: string }) =>
      api.del<void>(`/menu-items/${vars.menuItemId}/recipe/${vars.ingredientId}`),
    onSuccess: (_r, vars) => void qc.invalidateQueries({ queryKey: qk.recipe(vars.menuItemId) }),
  });
}

function invalidateRooms(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.rooms });
  void qc.invalidateQueries({ queryKey: qk.roomCategories });
  void qc.invalidateQueries({ queryKey: qk.dashboard });
}

export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RoomInput) => api.post<RoomDTO>('/rooms', body),
    onSuccess: () => invalidateRooms(qc),
  });
}
export function useUpdateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: Partial<RoomInput> }) =>
      api.patch<RoomDTO>(`/rooms/${vars.id}`, vars.body),
    onSuccess: () => invalidateRooms(qc),
  });
}
export function useDeleteRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/rooms/${id}`),
    onSuccess: () => invalidateRooms(qc),
  });
}
export function useCreateRoomCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RoomCategoryInput) => api.post<RoomCategoryDTO>('/room-categories', body),
    onSuccess: () => invalidateRooms(qc),
  });
}
export function useUpdateRoomCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: Partial<RoomCategoryInput> }) =>
      api.patch<RoomCategoryDTO>(`/room-categories/${vars.id}`, vars.body),
    onSuccess: () => invalidateRooms(qc),
  });
}
export function useDeleteRoomCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/room-categories/${id}`),
    onSuccess: () => invalidateRooms(qc),
  });
}

/** Refresh the floor board (POS + admin share `qk.tables`) and the dashboard tile. */
function invalidateTables(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.tables });
  void qc.invalidateQueries({ queryKey: qk.dashboard });
}

export function useCreateTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TableInput) => api.post<DiningTableDTO>('/tables', body),
    onSuccess: () => invalidateTables(qc),
  });
}
export function useUpdateTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: Partial<TableInput> }) =>
      api.patch<DiningTableDTO>(`/tables/${vars.id}`, vars.body),
    onSuccess: () => invalidateTables(qc),
  });
}
export function useDeleteTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/tables/${id}`),
    onSuccess: () => invalidateTables(qc),
  });
}

export function useUpdatePrinter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: PrinterInput }) =>
      api.patch<PrinterDTO>(`/printing/printers/${vars.id}`, vars.body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.printers });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}
export function useRetryPrintJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<PrintJobDTO>(`/printing/jobs/${id}/retry`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['print-jobs'] }),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserInput) => api.post<AuthUserDTO>('/users', body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.users }),
  });
}
export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; body: UserPatch }) =>
      api.patch<AuthUserDTO>(`/users/${vars.id}`, vars.body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.users }),
  });
}
export function useSetUserPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; pin: string }) =>
      api.post<AuthUserDTO>(`/users/${vars.id}/pin`, { pin: vars.pin }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.users }),
  });
}
export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<AuthUserDTO>(`/users/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.users }),
  });
}
