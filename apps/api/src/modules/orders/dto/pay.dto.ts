import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * A single tender. `charge_to_room` is intentionally excluded here — folio
 * settlement is added with the bookings module (Task 13); Task 11 supports
 * cash and card.
 */
export class PaymentInput {
  @IsIn(['cash', 'card'])
  method!: 'cash' | 'card';

  @IsNumber()
  @Min(0.01)
  amount!: number;

  /**
   * Physical cash handed over for a cash tender (spec: cash change). Used to
   * derive change = tendered − amount; `amount` still equals the billed portion.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  tendered?: number;

  @IsOptional()
  @IsString()
  reference?: string;
}

/** Settle an order as a single bill; tenders must sum to the order total. */
export class PayDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentInput)
  payments!: PaymentInput[];
}
