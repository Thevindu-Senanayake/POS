'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  BOARD_PLANS,
  canPerform,
  formatMoney,
  type BoardPlan,
  type BookingDTO,
  type RoomDTO,
} from '@pos/shared';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { FullscreenSpinner, Spinner } from '@/components/ui/spinner';
import { useCreateOrder } from '@/features/pos/api';
import { useAuthStore } from '@/stores/auth-store';
import {
  useAddFolioCharge,
  useBookingsForRoom,
  useCancelBooking,
  useCheckIn,
  useCheckOut,
  useCreateBooking,
  useRoom,
} from './api';
import {
  BOARD_PLAN_LABELS,
  BOOKING_STATUS_STYLES,
  FOLIO_SOURCE_LABELS,
  ROOM_STATUS_STYLES,
  formatStayDate,
  isActiveBooking,
  toDateInput,
} from './format';

const inputClass =
  'w-full rounded-xl border border-sand-300 bg-white px-3 py-2.5 text-base outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

/**
 * Room workspace (spec §2.7): the guest folio and its lifecycle. Shows the active
 * booking with a running folio (room charge + posted charges), or a reservation
 * form when the room is free. Front-desk actions (reserve / check-in / check-out /
 * cancel / add charge) are limited to admin + cashier, mirroring the API role
 * guard; starting a room-service order follows the take-orders permission.
 */
export function RoomDetail({ roomId }: { roomId: string }) {
  const router = useRouter();
  const roomQuery = useRoom(roomId);
  const bookingsQuery = useBookingsForRoom(roomId);
  const role = useAuthStore((s) => s.user?.role);

  const canFrontDesk = role === 'admin' || role === 'cashier';
  const canOrder = role ? canPerform('take_orders', role) : false;

  const room = roomQuery.data;
  const activeBooking = bookingsQuery.data?.find((b) => isActiveBooking(b.status)) ?? null;

  if (roomQuery.isLoading || bookingsQuery.isLoading) return <FullscreenSpinner label="Loading room…" />;
  if (roomQuery.isError || !room) {
    return <CenterNote>Could not load this room.</CenterNote>;
  }

  const style = ROOM_STATUS_STYLES[room.status];

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/rooms')}
          className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-sand-100"
        >
          ← Rooms
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Room {room.roomNumber}</h1>
          <p className="text-sm text-slate-500">
            {room.categoryName ?? 'Room'} · {formatMoney(room.effectiveRate)}/night
          </p>
        </div>
        <span className={`ml-auto rounded-full px-3 py-1 text-xs font-bold ${style.badge}`}>
          {style.label}
        </span>
      </div>

      {activeBooking ? (
        <BookingPanel
          booking={activeBooking}
          canFrontDesk={canFrontDesk}
          canOrder={canOrder}
        />
      ) : room.status === 'maintenance' ? (
        <CardNote>This room is under maintenance and cannot be booked.</CardNote>
      ) : (
        <ReservePanel room={room} canFrontDesk={canFrontDesk} />
      )}
    </div>
  );
}

// --- Active booking + folio --------------------------------------------------

function BookingPanel({
  booking,
  canFrontDesk,
  canOrder,
}: {
  booking: BookingDTO;
  canFrontDesk: boolean;
  canOrder: boolean;
}) {
  const router = useRouter();
  const checkIn = useCheckIn();
  const cancel = useCancelBooking();
  const createOrder = useCreateOrder();
  const [error, setError] = useState<string | null>(null);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const statusStyle = BOOKING_STATUS_STYLES[booking.status];

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    }
  };

  const startRoomService = () =>
    act(async () => {
      const order = await createOrder.mutateAsync({
        channel: 'room_service',
        bookingId: booking.id,
      });
      router.push(`/pos/order/${order.id}`);
    });

  const busy = checkIn.isPending || cancel.isPending || createOrder.isPending;

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-lg font-bold text-slate-900">{booking.guestName}</div>
            {booking.guestPhone ? (
              <div className="text-sm text-slate-500">{booking.guestPhone}</div>
            ) : null}
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyle.badge}`}>
            {statusStyle.label}
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <Field label="Check-in" value={formatStayDate(booking.checkIn)} />
          <Field label="Check-out" value={formatStayDate(booking.checkOut)} />
          <Field label="Board plan" value={BOARD_PLAN_LABELS[booking.boardPlan]} />
          <Field
            label="Nights"
            value={`${booking.nights} × ${formatMoney(booking.agreedRate)}`}
          />
        </dl>
      </section>

      <FolioCard booking={booking} />

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {booking.status === 'reserved' && canFrontDesk ? (
          <>
            <Button size="lg" onClick={() => act(() => checkIn.mutateAsync(booking.id))} disabled={busy}>
              {checkIn.isPending ? <Spinner /> : 'Check in'}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => act(() => cancel.mutateAsync(booking.id))}
              disabled={busy}
            >
              Cancel reservation
            </Button>
          </>
        ) : null}

        {booking.status === 'checked_in' ? (
          <>
            {canOrder ? (
              <Button size="lg" onClick={startRoomService} disabled={busy}>
                {createOrder.isPending ? <Spinner /> : 'New room-service order'}
              </Button>
            ) : null}
            {canFrontDesk ? (
              <>
                <Button size="lg" variant="secondary" onClick={() => setChargeOpen(true)} disabled={busy}>
                  Add charge
                </Button>
                <Button size="lg" variant="danger" onClick={() => setCheckoutOpen(true)} disabled={busy}>
                  Check out
                </Button>
              </>
            ) : null}
          </>
        ) : null}
      </div>

      {!canFrontDesk ? (
        <p className="text-xs text-slate-500">
          Front-desk actions (check-in, checkout, charges) require a cashier or admin.
        </p>
      ) : null}

      {chargeOpen ? (
        <AddChargeModal bookingId={booking.id} onClose={() => setChargeOpen(false)} />
      ) : null}
      {checkoutOpen ? (
        <CheckoutModal booking={booking} onClose={() => setCheckoutOpen(false)} />
      ) : null}
    </div>
  );
}

function FolioCard({ booking }: { booking: BookingDTO }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Folio</h2>
      <div className="divide-y divide-sand-100 text-sm">
        <FolioRow
          label="Room charge"
          hint={`${booking.nights} night${booking.nights > 1 ? 's' : ''} × ${formatMoney(booking.agreedRate)}`}
          amount={booking.roomCharge}
        />
        {booking.folioCharges.map((c) => (
          <FolioRow
            key={c.id}
            label={FOLIO_SOURCE_LABELS[c.source]}
            hint={c.description ?? undefined}
            amount={c.amount}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-sand-200 pt-3">
        <span className="text-base font-extrabold text-slate-900">Grand total</span>
        <span className="text-xl font-extrabold text-gradient">{formatMoney(booking.grandTotal)}</span>
      </div>
    </section>
  );
}

function FolioRow({ label, hint, amount }: { label: string; hint?: string; amount: number }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="min-w-0">
        <div className="font-semibold text-slate-800">{label}</div>
        {hint ? <div className="truncate text-xs text-slate-500">{hint}</div> : null}
      </div>
      <div className={`font-semibold ${amount === 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
        {amount === 0 ? 'Comp' : formatMoney(amount)}
      </div>
    </div>
  );
}

// --- Reserve a vacant room ---------------------------------------------------

const reserveSchema = z
  .object({
    guestName: z.string().trim().min(1, 'Guest name is required'),
    guestPhone: z.string().trim().optional(),
    checkIn: z.string().min(1, 'Check-in date is required'),
    checkOut: z.string().min(1, 'Check-out date is required'),
    boardPlan: z.string(),
  })
  .refine((v) => new Date(v.checkOut) > new Date(v.checkIn), {
    message: 'Check-out must be after check-in',
    path: ['checkOut'],
  });
type ReserveValues = z.infer<typeof reserveSchema>;

function ReservePanel({ room, canFrontDesk }: { room: RoomDTO; canFrontDesk: boolean }) {
  const createBooking = useCreateBooking();
  const [formError, setFormError] = useState<string | null>(null);

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86_400_000);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ReserveValues>({
    resolver: zodResolver(reserveSchema),
    defaultValues: {
      guestName: '',
      guestPhone: '',
      checkIn: toDateInput(now),
      checkOut: toDateInput(tomorrow),
      boardPlan: 'room_only',
    },
  });

  if (!canFrontDesk) {
    return <CardNote>This room is vacant. A cashier or admin can create a booking.</CardNote>;
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createBooking.mutateAsync({
        roomId: room.id,
        guestName: values.guestName,
        guestPhone: values.guestPhone || undefined,
        checkIn: new Date(values.checkIn).toISOString(),
        checkOut: new Date(values.checkOut).toISOString(),
        boardPlan: values.boardPlan as BoardPlan,
      });
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Could not create the booking');
    }
  });

  return (
    <section className="card p-4">
      <h2 className="mb-3 text-base font-bold text-slate-900">New booking</h2>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="guestName">Guest name</Label>
          <input id="guestName" autoFocus className={inputClass} {...register('guestName')} />
          <FieldError message={errors.guestName?.message} />
        </div>
        <div>
          <Label htmlFor="guestPhone">Phone (optional)</Label>
          <input id="guestPhone" className={inputClass} {...register('guestPhone')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="checkIn">Check-in</Label>
            <input id="checkIn" type="date" className={inputClass} {...register('checkIn')} />
            <FieldError message={errors.checkIn?.message} />
          </div>
          <div>
            <Label htmlFor="checkOut">Check-out</Label>
            <input id="checkOut" type="date" className={inputClass} {...register('checkOut')} />
            <FieldError message={errors.checkOut?.message} />
          </div>
        </div>
        <div>
          <Label htmlFor="boardPlan">Board plan</Label>
          <select id="boardPlan" className={inputClass} {...register('boardPlan')}>
            {BOARD_PLANS.map((plan) => (
              <option key={plan} value={plan}>
                {BOARD_PLAN_LABELS[plan]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Agreed rate is snapshotted at {formatMoney(room.effectiveRate)}/night.
          </p>
        </div>
        {formError ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
        ) : null}
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : 'Reserve room'}
        </Button>
      </form>
    </section>
  );
}

// --- Add ad-hoc folio charge -------------------------------------------------

const chargeSchema = z.object({
  description: z.string().trim().min(1, 'Description is required'),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
});
type ChargeValues = z.infer<typeof chargeSchema>;

function AddChargeModal({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const addCharge = useAddFolioCharge();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChargeValues>({
    resolver: zodResolver(chargeSchema),
    defaultValues: { description: '', amount: 0 },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await addCharge.mutateAsync({
        bookingId,
        dto: { amount: values.amount, description: values.description },
      });
      onClose();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Could not add the charge');
    }
  });

  return (
    <Modal open onClose={onClose} title="Add folio charge">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="charge-desc">Description</Label>
          <input
            id="charge-desc"
            autoFocus
            placeholder="Minibar, laundry, …"
            className={inputClass}
            {...register('description')}
          />
          <FieldError message={errors.description?.message} />
        </div>
        <div>
          <Label htmlFor="charge-amount">Amount</Label>
          <input
            id="charge-amount"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            className={inputClass}
            {...register('amount')}
          />
          <FieldError message={errors.amount?.message} />
        </div>
        {formError ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
        ) : null}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : 'Add charge'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// --- Checkout (final bill = folio + nights × rate) ---------------------------

function CheckoutModal({ booking, onClose }: { booking: BookingDTO; onClose: () => void }) {
  const checkOut = useCheckOut();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<BookingDTO | null>(null);

  const confirm = async () => {
    setError(null);
    try {
      setDone(await checkOut.mutateAsync(booking.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not check the guest out');
    }
  };

  const settled = done ?? booking;

  return (
    <Modal open onClose={onClose} title={done ? 'Checked out' : 'Confirm check-out'}>
      <div className="space-y-4">
        <div className="rounded-xl bg-brand-gradient px-4 py-4 text-center text-white shadow-card">
          <div className="text-xs font-semibold uppercase tracking-wide text-white/70">
            Final bill · {settled.guestName}
          </div>
          <div className="mt-1 text-3xl font-extrabold">{formatMoney(settled.grandTotal)}</div>
          <div className="mt-1 text-xs text-white/70">
            Room {formatMoney(settled.roomCharge)} + extras {formatMoney(settled.folioTotal)}
          </div>
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        {done ? (
          <Button className="w-full" onClick={onClose}>
            Done
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" onClick={confirm} disabled={checkOut.isPending}>
              {checkOut.isPending ? <Spinner /> : 'Confirm check-out'}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// --- Small shared bits -------------------------------------------------------

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-semibold text-slate-700">
      {children}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-sm text-red-600">{message}</p> : null;
}

function CenterNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 text-center text-slate-500">
      {children}
    </div>
  );
}

function CardNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="card p-6 text-center text-slate-500">
      {children}
    </div>
  );
}
