import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { BookingDTO } from '@pos/shared';
import { BookingStatusSchema } from '@pos/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BookingsService } from './bookings.service';
import { AddFolioChargeDto } from './dto/add-folio-charge.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

/**
 * Front-desk booking management (spec §2.7). Writes are gated to admin/cashier;
 * reads are open to any authenticated user for the room status board.
 */
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('roomId') roomId?: string,
  ): Promise<BookingDTO[]> {
    const parsed = BookingStatusSchema.safeParse(status);
    return this.bookings.list({
      status: parsed.success ? parsed.data : undefined,
      roomId: roomId || undefined,
    });
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<BookingDTO> {
    return this.bookings.get(id);
  }

  @Post()
  @Roles('admin', 'cashier')
  create(@Body() dto: CreateBookingDto, @CurrentUser('userId') userId: string): Promise<BookingDTO> {
    return this.bookings.create(dto, userId);
  }

  @Post(':id/check-in')
  @Roles('admin', 'cashier')
  checkIn(@Param('id') id: string): Promise<BookingDTO> {
    return this.bookings.checkIn(id);
  }

  @Post(':id/check-out')
  @Roles('admin', 'cashier')
  checkOut(@Param('id') id: string): Promise<BookingDTO> {
    return this.bookings.checkOut(id);
  }

  @Post(':id/cancel')
  @Roles('admin', 'cashier')
  cancel(@Param('id') id: string): Promise<BookingDTO> {
    return this.bookings.cancel(id);
  }

  @Post(':id/charges')
  @Roles('admin', 'cashier')
  addCharge(
    @Param('id') id: string,
    @Body() dto: AddFolioChargeDto,
    @CurrentUser('userId') userId: string,
  ): Promise<BookingDTO> {
    return this.bookings.addFolioCharge(id, dto, userId);
  }
}
