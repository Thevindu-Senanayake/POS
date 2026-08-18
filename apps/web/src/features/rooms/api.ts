'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  BoardPlan,
  BookingDTO,
  RoomCategoryDTO,
  RoomDTO,
} from '@pos/shared';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';

// --- Request payload shapes (mirror the api DTOs) ----------------------------

export interface CreateBookingInput {
  roomId: string;
  guestName: string;
  guestPhone?: string;
  checkIn: string;
  checkOut: string;
  boardPlan?: BoardPlan;
}

export interface AddFolioChargeInput {
  amount: number;
  description: string;
}

// --- Reads -------------------------------------------------------------------

export function useRooms() {
  return useQuery({
    queryKey: qk.rooms,
    queryFn: () => api.get<RoomDTO[]>('/rooms'),
  });
}

export function useRoom(id: string | null) {
  return useQuery({
    queryKey: qk.room(id ?? 'none'),
    queryFn: () => api.get<RoomDTO>(`/rooms/${id}`),
    enabled: !!id,
  });
}

export function useRoomCategories() {
  return useQuery({
    queryKey: qk.roomCategories,
    queryFn: () => api.get<RoomCategoryDTO[]>('/room-categories'),
    staleTime: 5 * 60_000,
  });
}

export function useBookings(status?: string) {
  return useQuery({
    queryKey: qk.bookings(status),
    queryFn: () =>
      api.get<BookingDTO[]>(`/bookings${status ? `?status=${status}` : ''}`),
  });
}

/** All bookings for one room (any status), newest first — used by room detail. */
export function useBookingsForRoom(roomId: string | null) {
  return useQuery({
    queryKey: qk.bookingsForRoom(roomId ?? 'none'),
    queryFn: () => api.get<BookingDTO[]>(`/bookings?roomId=${roomId}`),
    enabled: !!roomId,
  });
}

// --- Cache sync shared by every booking-mutating hook ------------------------

/** Refresh every booking view + the room board after a booking changes. */
function syncBooking(qc: QueryClient, booking: BookingDTO): BookingDTO {
  qc.setQueryData(qk.booking(booking.id), booking);
  void qc.invalidateQueries({ queryKey: ['bookings'] });
  void qc.invalidateQueries({ queryKey: qk.rooms });
  return booking;
}

// --- Booking lifecycle mutations ---------------------------------------------

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBookingInput) => api.post<BookingDTO>('/bookings', body),
    onSuccess: (booking) => syncBooking(qc, booking),
  });
}

export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) =>
      api.post<BookingDTO>(`/bookings/${bookingId}/check-in`),
    onSuccess: (booking) => syncBooking(qc, booking),
  });
}

export function useCheckOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) =>
      api.post<BookingDTO>(`/bookings/${bookingId}/check-out`),
    onSuccess: (booking) => syncBooking(qc, booking),
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) => api.post<BookingDTO>(`/bookings/${bookingId}/cancel`),
    onSuccess: (booking) => syncBooking(qc, booking),
  });
}

export function useAddFolioCharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { bookingId: string; dto: AddFolioChargeInput }) =>
      api.post<BookingDTO>(`/bookings/${vars.bookingId}/charges`, vars.dto),
    onSuccess: (booking) => syncBooking(qc, booking),
  });
}
