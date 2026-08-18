import { IsDateString, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { BOARD_PLANS } from '@pos/shared';
import type { BoardPlan } from '@pos/shared';

/**
 * Reserve a room (spec §2.7). The nightly rate is snapshotted server-side from
 * the room's effective rate at creation, so later config changes never move an
 * in-progress guest's bill.
 */
export class CreateBookingDto {
  @IsString()
  @MinLength(1)
  roomId!: string;

  @IsString()
  @MinLength(1)
  guestName!: string;

  @IsOptional()
  @IsString()
  guestPhone?: string;

  @IsDateString()
  checkIn!: string;

  @IsDateString()
  checkOut!: string;

  @IsOptional()
  @IsIn([...BOARD_PLANS])
  boardPlan?: BoardPlan;
}
