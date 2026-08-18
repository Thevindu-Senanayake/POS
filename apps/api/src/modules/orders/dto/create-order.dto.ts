import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CHANNELS } from '@pos/shared';
import type { Channel } from '@pos/shared';

/** One requested line on an order. Price + station are resolved server-side. */
export class OrderItemInput {
  @IsString()
  @MinLength(1)
  menuItemId!: string;

  @IsInt()
  @Min(1)
  qty!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateOrderDto {
  @IsIn([...CHANNELS])
  channel!: Channel;

  /** Dine-in orders belong to an open table session. */
  @IsOptional()
  @IsString()
  tableSessionId?: string;

  /** Room-service orders belong to a booking (folio settlement in Task 13). */
  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemInput)
  items?: OrderItemInput[];
}
