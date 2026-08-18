import { IsNumber, IsString, Min, MinLength } from 'class-validator';

/**
 * Post a manual charge to a guest folio (spec §2.7, source `misc`). Order-derived
 * charges are written automatically when an order is charged to the room; this
 * endpoint is for ad-hoc extras (minibar, laundry, etc.).
 */
export class AddFolioChargeDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @MinLength(1)
  description!: string;
}
