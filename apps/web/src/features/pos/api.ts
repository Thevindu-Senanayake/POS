'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  BillDTO,
  BookingDTO,
  Channel,
  DiningTableDTO,
  DiscountScope,
  DiscountType,
  MenuItemDTO,
  OrderDTO,
  ServiceChargeRuleDTO,
  TableSessionDTO,
} from '@pos/shared';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

// --- Request payload shapes (mirror the api DTOs; cash/card only on pay) -----

export interface OrderItemInput {
  menuItemId: string;
  qty: number;
  notes?: string;
}

export interface CreateOrderInput {
  channel: Channel;
  tableSessionId?: string;
  bookingId?: string;
  notes?: string;
  items?: OrderItemInput[];
}

/** charge_to_room is its own endpoint, so tender payments are cash/card only. */
export interface PaymentInput {
  method: 'cash' | 'card';
  amount: number;
  reference?: string;
}

export interface SplitPartInput {
  label?: string;
  orderItemIds: string[];
  payments: PaymentInput[];
}

export interface ApplyDiscountInput {
  scope: DiscountScope;
  type: DiscountType;
  value: number;
  reason?: string;
  orderItemId?: string;
}

// --- Reads -------------------------------------------------------------------

export function useTables() {
  return useQuery({
    queryKey: qk.tables,
    queryFn: () => api.get<DiningTableDTO[]>('/tables'),
  });
}

export function useTable(id: string | null) {
  return useQuery({
    queryKey: qk.table(id ?? 'none'),
    queryFn: () => api.get<DiningTableDTO>(`/tables/${id}`),
    enabled: !!id,
  });
}

export function useMenu() {
  return useQuery({
    queryKey: qk.menu,
    queryFn: () => api.get<MenuItemDTO[]>('/menu-items'),
    staleTime: 60_000,
  });
}

export function useOrder(id: string | null) {
  return useQuery({
    queryKey: qk.order(id ?? 'none'),
    queryFn: () => api.get<OrderDTO>(`/orders/${id}`),
    enabled: !!id,
  });
}

export function useServiceCharges() {
  return useQuery({
    queryKey: qk.serviceCharges,
    queryFn: () => api.get<ServiceChargeRuleDTO[]>('/service-charges'),
    staleTime: 5 * 60_000,
  });
}

export function useCheckedInBookings() {
  return useQuery({
    queryKey: qk.bookings('checked_in'),
    queryFn: () => api.get<BookingDTO[]>('/bookings?status=checked_in'),
  });
}

// --- Cache sync shared by every order-mutating hook --------------------------

/** Write a returned order into the cache and refresh the boards it may affect. */
function syncOrder(qc: QueryClient, order: OrderDTO): OrderDTO {
  qc.setQueryData(qk.order(order.id), order);
  void qc.invalidateQueries({ queryKey: qk.tables });
  void qc.invalidateQueries({ queryKey: qk.sessions });
  return order;
}

/** After settlement the order returns a bill, not an order — refetch broadly. */
function invalidateAfterSettlement(qc: QueryClient, orderId: string) {
  void qc.invalidateQueries({ queryKey: qk.order(orderId) });
  void qc.invalidateQueries({ queryKey: qk.tables });
  void qc.invalidateQueries({ queryKey: qk.sessions });
  void qc.invalidateQueries({ queryKey: ['bookings'] });
  void qc.invalidateQueries({ queryKey: qk.rooms });
}

// --- Table / session mutations ----------------------------------------------

export function useOpenSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { tableId: string; waiterId?: string }) =>
      api.post<TableSessionDTO>(`/tables/${vars.tableId}/session`, { waiterId: vars.waiterId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.tables });
      void qc.invalidateQueries({ queryKey: qk.sessions });
    },
  });
}

export function useCleanTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tableId: string) => api.post<DiningTableDTO>(`/tables/${tableId}/clean`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.tables }),
  });
}

export function useCloseSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      api.post<TableSessionDTO>(`/sessions/${sessionId}/close`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.tables });
      void qc.invalidateQueries({ queryKey: qk.sessions });
    },
  });
}

// --- Order-building mutations ------------------------------------------------

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateOrderInput) => api.post<OrderDTO>('/orders', body),
    onSuccess: (order) => syncOrder(qc, order),
  });
}

export function useAddItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { orderId: string; items: OrderItemInput[] }) =>
      api.post<OrderDTO>(`/orders/${vars.orderId}/items`, { items: vars.items }),
    onSuccess: (order) => syncOrder(qc, order),
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { orderId: string; itemId: string; qty?: number; notes?: string }) =>
      api.patch<OrderDTO>(`/orders/${vars.orderId}/items/${vars.itemId}`, {
        qty: vars.qty,
        notes: vars.notes,
      }),
    onSuccess: (order) => syncOrder(qc, order),
  });
}

export function useRemoveItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { orderId: string; itemId: string }) =>
      api.del<OrderDTO>(`/orders/${vars.orderId}/items/${vars.itemId}`),
    onSuccess: (order) => syncOrder(qc, order),
  });
}

export function useSendToKitchen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { orderId: string; itemIds?: string[] }) =>
      api.post<OrderDTO>(`/orders/${vars.orderId}/send`, { itemIds: vars.itemIds }),
    onSuccess: (order) => syncOrder(qc, order),
  });
}

export function useServe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { orderId: string; itemIds?: string[] }) =>
      api.post<OrderDTO>(`/orders/${vars.orderId}/serve`, { itemIds: vars.itemIds }),
    onSuccess: (order) => syncOrder(qc, order),
  });
}

export function useRequestBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => api.post<OrderDTO>(`/orders/${orderId}/request-bill`),
    onSuccess: (order) => syncOrder(qc, order),
  });
}

// --- Discounts / void (manager-PIN gated) ------------------------------------

export function useApplyDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { orderId: string; dto: ApplyDiscountInput; managerPin?: string }) =>
      api.post<OrderDTO>(`/orders/${vars.orderId}/discounts`, vars.dto, {
        managerPin: vars.managerPin,
      }),
    onSuccess: (order) => syncOrder(qc, order),
  });
}

export function useRemoveDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { orderId: string; discountId: string }) =>
      api.del<OrderDTO>(`/orders/${vars.orderId}/discounts/${vars.discountId}`),
    onSuccess: (order) => syncOrder(qc, order),
  });
}

export function useVoidItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      orderId: string;
      itemId: string;
      reason?: string;
      managerPin?: string;
    }) =>
      api.post<OrderDTO>(
        `/orders/${vars.orderId}/items/${vars.itemId}/void`,
        { reason: vars.reason },
        { managerPin: vars.managerPin },
      ),
    onSuccess: (order) => syncOrder(qc, order),
  });
}

// --- Settlement --------------------------------------------------------------

export function usePay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { orderId: string; label?: string; payments: PaymentInput[] }) =>
      api.post<BillDTO>(`/orders/${vars.orderId}/pay`, {
        label: vars.label,
        payments: vars.payments,
      }),
    onSuccess: (_bill, vars) => invalidateAfterSettlement(qc, vars.orderId),
  });
}

export function useChargeToRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { orderId: string; bookingId?: string; label?: string; comp?: boolean }) =>
      api.post<BillDTO>(`/orders/${vars.orderId}/charge-to-room`, {
        bookingId: vars.bookingId,
        label: vars.label,
        comp: vars.comp,
      }),
    onSuccess: (_bill, vars) => invalidateAfterSettlement(qc, vars.orderId),
  });
}

export function useSplitBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { orderId: string; parts: SplitPartInput[]; managerPin?: string }) =>
      api.post<BillDTO[]>(
        `/orders/${vars.orderId}/split`,
        { parts: vars.parts },
        { managerPin: vars.managerPin },
      ),
    onSuccess: (_bills, vars) => invalidateAfterSettlement(qc, vars.orderId),
  });
}
