import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { BASE_UNITS, INGREDIENT_DEPARTMENTS, type BaseUnit, type IngredientDepartment } from '@pos/shared';

export class CreateIngredientDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn([...BASE_UNITS])
  baseUnit!: BaseUnit;

  /** Bar stock vs restaurant raw material; defaults to `restaurant` when omitted. */
  @IsOptional()
  @IsIn([...INGREDIENT_DEPARTMENTS])
  department?: IngredientDepartment;

  /** Bottle/can barcode (spirits); scanned at the bar. Unique when set. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string | null;

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
