import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { DiscountScopeSchema, DiscountTypeSchema } from '@pos/shared';
import type { DiscountScope, DiscountType } from '@pos/shared';

/**
 * Apply an order- or line-level discount (spec §8). Cashiers need a manager PIN
 * (enforced by PermissionGuard); the approving manager is recorded on the audit
 * row. `orderItemId` is required when `scope` is `line`.
 */
export class ApplyDiscountDto {
  @IsIn([...DiscountScopeSchema.options])
  scope!: DiscountScope;

  @IsIn([...DiscountTypeSchema.options])
  type!: DiscountType;

  /** Percent (when type=percentage) or flat amount (when type=flat). */
  @IsNumber()
  @Min(0)
  value!: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  orderItemId?: string;

  /** Read by PermissionGuard when the caller's role requires a PIN. */
  @IsOptional()
  @IsString()
  managerPin?: string;
}
