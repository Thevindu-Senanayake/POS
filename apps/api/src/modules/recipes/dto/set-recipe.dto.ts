import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RecipeLineInput {
  @IsString()
  @MinLength(1)
  ingredientId!: string;

  /** Quantity consumed per one unit sold, in the ingredient's base unit. */
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

/** Replaces the entire bill of materials for a menu item. Empty clears it. */
export class SetRecipeDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeLineInput)
  items!: RecipeLineInput[];
}
