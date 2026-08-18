import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

/** Manual stock reasons only — `sale`/`purchase` come from orders/goods-receiving. */
const MANUAL_REASONS = ['adjustment', 'wastage', 'return'] as const;
type ManualReason = (typeof MANUAL_REASONS)[number];

export class AdjustStockDto {
  /** Signed change in base unit (negative for wastage/removal). Non-zero. */
  @IsNumber()
  changeQty!: number;

  @IsIn(MANUAL_REASONS)
  reason!: ManualReason;

  @IsOptional()
  @IsString()
  note?: string;
}
