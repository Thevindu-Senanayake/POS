import { IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { ROOM_STATUSES } from '@pos/shared';
import type { RoomStatus } from '@pos/shared';

/**
 * Patch a room (admin). All fields optional. `rateOverride` accepts `null`
 * explicitly to clear the override and fall back to the category default.
 */
export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  roomNumber?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  roomCategoryId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rateOverride?: number | null;

  @IsOptional()
  @IsIn([...ROOM_STATUSES])
  status?: RoomStatus;
}
