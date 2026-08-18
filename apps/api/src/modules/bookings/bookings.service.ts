import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@pos/db';
import type {
  BookingDTO,
  BoardPlan,
  Channel,
  FolioChargeDTO,
  FolioSource,
} from '@pos/shared';
import { round2, sumMoney } from '@pos/shared';
import { decToNum } from '../../common/decimal';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { effectiveRate } from '../rooms/rooms.service';
import { AddFolioChargeDto } from './dto/add-folio-charge.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

const DAY_MS = 86_400_000;

const BOOKING_INCLUDE = {
  room: { select: { roomNumber: true } },
  folioCharges: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.BookingInclude;

type BookingWithRelations = Prisma.BookingGetPayload<{ include: typeof BOOKING_INCLUDE }>;

/** Nights charged for a stay: whole days between the dates, minimum one. */
export function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / DAY_MS));
}

/** Which folio bucket an order settles into, by channel (spec §2.7). */
function folioSourceForChannel(channel: Channel): FolioSource {
  switch (channel) {
    case 'room_service':
      return 'room_service_order';
    case 'dine_in_bar':
      return 'bar_order';
    default:
      return 'restaurant_order';
  }
}

/**
 * Bookings and the guest folio (spec §2.7). A folio is the running bill of every
 * charge against a stay; the final checkout total is the folio sum plus
 * nights x agreed rate. Charge-to-room settlement is posted here from the orders
 * module via {@link recordOrderCharge}.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // --- Reads -------------------------------------------------------------

  async list(filter: { status?: string; roomId?: string }): Promise<BookingDTO[]> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        ...(filter.status ? { status: filter.status as BookingWithRelations['status'] } : {}),
        ...(filter.roomId ? { roomId: filter.roomId } : {}),
      },
      include: BOOKING_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return bookings.map((b) => this.toBookingDTO(b));
  }

  async get(id: string): Promise<BookingDTO> {
    return this.toBookingDTO(await this.loadOrThrow(id));
  }

  // --- Lifecycle ---------------------------------------------------------

  /** Reserve a room; snapshots the effective nightly rate as the agreed rate. */
  async create(dto: CreateBookingDto, userId: string): Promise<BookingDTO> {
    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);
    if (checkOut.getTime() <= checkIn.getTime()) {
      throw new BadRequestException('checkOut must be after checkIn');
    }

    const room = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
      include: { roomCategory: { select: { defaultRate: true } } },
    });
    if (!room) throw new BadRequestException('Room not found');
    if (room.status === 'maintenance') {
      throw new ConflictException('Room is under maintenance and cannot be booked');
    }

    const agreedRate = effectiveRate(room.rateOverride, room.roomCategory.defaultRate);
    const booking = await this.prisma.booking.create({
      data: {
        roomId: dto.roomId,
        guestName: dto.guestName,
        guestPhone: dto.guestPhone ?? null,
        checkIn,
        checkOut,
        boardPlan: dto.boardPlan ?? 'room_only',
        agreedRate: new Prisma.Decimal(agreedRate),
        status: 'reserved',
        createdById: userId,
      },
      include: BOOKING_INCLUDE,
    });
    this.realtime.emitRoomsUpdated();
    return this.toBookingDTO(booking);
  }

  /** Check a guest in: reserved -> checked_in, room -> occupied. */
  async checkIn(id: string): Promise<BookingDTO> {
    const booking = await this.prisma.$transaction(async (tx) => {
      const current = await tx.booking.findUnique({ where: { id }, include: { room: true } });
      if (!current) throw new NotFoundException('Booking not found');
      if (current.status !== 'reserved') {
        throw new ConflictException(`Cannot check in a ${current.status} booking`);
      }
      if (current.room.status !== 'vacant') {
        throw new ConflictException(`Room is ${current.room.status}; cannot check in`);
      }
      await tx.room.update({ where: { id: current.roomId }, data: { status: 'occupied' } });
      return tx.booking.update({
        where: { id },
        data: { status: 'checked_in' },
        include: BOOKING_INCLUDE,
      });
    });
    this.realtime.emitRoomsUpdated();
    return this.toBookingDTO(booking);
  }

  /**
   * Check a guest out: settles the folio (folio sum + nights x agreed rate is the
   * returned grand total), sets checked_out, and frees the room.
   */
  async checkOut(id: string): Promise<BookingDTO> {
    const booking = await this.prisma.$transaction(async (tx) => {
      const current = await tx.booking.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Booking not found');
      if (current.status !== 'checked_in') {
        throw new ConflictException(`Cannot check out a ${current.status} booking`);
      }
      await tx.room.update({ where: { id: current.roomId }, data: { status: 'vacant' } });
      return tx.booking.update({
        where: { id },
        data: { status: 'checked_out' },
        include: BOOKING_INCLUDE,
      });
    });
    this.realtime.emitRoomsUpdated();
    return this.toBookingDTO(booking);
  }

  /** Cancel a reservation that never checked in. */
  async cancel(id: string): Promise<BookingDTO> {
    const current = await this.loadOrThrow(id);
    if (current.status !== 'reserved') {
      throw new ConflictException(
        'Only reserved bookings can be cancelled; check the guest out instead',
      );
    }
    const booking = await this.prisma.booking.update({
      where: { id },
      data: { status: 'cancelled' },
      include: BOOKING_INCLUDE,
    });
    this.realtime.emitRoomsUpdated();
    return this.toBookingDTO(booking);
  }

  // --- Folio -------------------------------------------------------------

  /** Post an ad-hoc misc charge to the folio. */
  async addFolioCharge(id: string, dto: AddFolioChargeDto, userId: string): Promise<BookingDTO> {
    const current = await this.loadOrThrow(id);
    this.assertActive(current.status);
    await this.prisma.folioCharge.create({
      data: {
        bookingId: id,
        source: 'misc',
        amount: new Prisma.Decimal(dto.amount),
        description: dto.description,
        createdById: userId,
      },
    });
    this.realtime.emitRoomsUpdated();
    return this.toBookingDTO(await this.loadOrThrow(id));
  }

  /**
   * Post an order's settlement to a room folio instead of taking payment
   * (spec §2.7). Called inside the orders charge-to-room transaction. A covered
   * board-plan room-service meal posts a zero-amount charge (KOT/stock already
   * happened); everything else posts the order total.
   */
  async recordOrderCharge(
    tx: Prisma.TransactionClient,
    params: {
      bookingId: string;
      channel: Channel;
      orderId: string;
      orderTotal: number;
      comp: boolean;
      createdById: string;
    },
  ): Promise<{ amount: number; source: FolioSource }> {
    const booking = await tx.booking.findUnique({ where: { id: params.bookingId } });
    if (!booking) throw new BadRequestException('Booking not found');
    this.assertActive(booking.status);

    const source = folioSourceForChannel(params.channel);
    let amount = params.orderTotal;
    let description: string | null = null;

    if (params.comp) {
      if (params.channel !== 'room_service') {
        throw new BadRequestException('Only room-service orders can be comped under a board plan');
      }
      if (booking.boardPlan !== 'half_board' && booking.boardPlan !== 'full_board') {
        throw new BadRequestException(
          'Board-plan comp requires a half-board or full-board booking',
        );
      }
      amount = 0;
      description = 'Board-plan meal (covered)';
    }

    await tx.folioCharge.create({
      data: {
        bookingId: params.bookingId,
        source,
        orderId: params.orderId,
        refId: params.orderId,
        amount: new Prisma.Decimal(amount),
        description,
        createdById: params.createdById,
      },
    });
    return { amount, source };
  }

  // --- Helpers -----------------------------------------------------------

  private assertActive(status: BookingWithRelations['status']): void {
    if (status === 'checked_out' || status === 'cancelled') {
      throw new ConflictException('Booking is not active');
    }
  }

  private async loadOrThrow(id: string): Promise<BookingWithRelations> {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: BOOKING_INCLUDE,
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  private toBookingDTO(booking: BookingWithRelations): BookingDTO {
    const agreedRate = decToNum(booking.agreedRate);
    const nights = nightsBetween(booking.checkIn, booking.checkOut);
    const roomCharge = round2(nights * agreedRate);
    const folioCharges: FolioChargeDTO[] = booking.folioCharges.map((c) => ({
      id: c.id,
      source: c.source,
      description: c.description,
      amount: decToNum(c.amount),
      createdAt: c.createdAt.toISOString(),
    }));
    const folioTotal = round2(sumMoney(folioCharges.map((c) => c.amount)));
    return {
      id: booking.id,
      roomId: booking.roomId,
      roomNumber: booking.room.roomNumber,
      guestName: booking.guestName,
      guestPhone: booking.guestPhone,
      checkIn: booking.checkIn.toISOString(),
      checkOut: booking.checkOut.toISOString(),
      boardPlan: booking.boardPlan as BoardPlan,
      agreedRate,
      status: booking.status,
      nights,
      roomCharge,
      folioCharges,
      folioTotal,
      grandTotal: round2(roomCharge + folioTotal),
    };
  }
}
