import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PaymentInput } from './pay.dto';

/** One split bill: a disjoint set of order lines plus its own tenders. */
export class SplitPartInput {
  @IsOptional()
  @IsString()
  label?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderItemIds!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentInput)
  payments!: PaymentInput[];
}

/**
 * Split an order into N fully-paid bills (spec §2.6). The parts must partition
 * every non-cancelled line exactly once. Manager-PIN for cashiers; audited.
 */
export class SplitBillDto {
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => SplitPartInput)
  parts!: SplitPartInput[];

  /** Read by PermissionGuard when the caller's role requires a PIN. */
  @IsOptional()
  @IsString()
  managerPin?: string;
}
