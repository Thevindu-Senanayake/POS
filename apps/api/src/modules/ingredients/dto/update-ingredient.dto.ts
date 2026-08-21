import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { BASE_UNITS, INGREDIENT_DEPARTMENTS, type BaseUnit, type IngredientDepartment } from '@pos/shared';

export class UpdateIngredientDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsIn([...BASE_UNITS])
  baseUnit?: BaseUnit;

  /** Move between bar stock and restaurant raw materials. */
  @IsOptional()
  @IsIn([...INGREDIENT_DEPARTMENTS])
  department?: IngredientDepartment;

  /** Bottle/can barcode (spirits); unique when set, null clears it. */
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

  // @IsOptional() also skips validation for null, letting the supplier be unset.
  @IsOptional()
  @IsString()
  supplierId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
