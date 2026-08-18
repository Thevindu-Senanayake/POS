import { IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { BASE_UNITS, type BaseUnit } from '@pos/shared';

export class CreateIngredientDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn([...BASE_UNITS])
  baseUnit!: BaseUnit;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPerUnit?: number;

  @IsOptional()
  @IsString()
  supplierId?: string;

  /** Optional opening balance, recorded as an `adjustment` movement. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  openingStock?: number;
}
