import { IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { ROOM_STATUSES } from '@pos/shared';
import type { RoomStatus } from '@pos/shared';

/** Create a physical room in a category (admin). */
export class CreateRoomDto {
  @IsString()
  @MinLength(1)
  roomNumber!: string;

  @IsString()
  @MinLength(1)
  roomCategoryId!: string;

  /** Overrides the category default nightly rate for this room (spec §2.7). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  rateOverride?: number;

  @IsOptional()
  @IsIn([...ROOM_STATUSES])
  status?: RoomStatus;
}
