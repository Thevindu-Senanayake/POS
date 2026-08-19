import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MENU_CATEGORIES, STATIONS } from '@pos/shared';
import type { MenuCategory, Station } from '@pos/shared';

export class UpdateMenuItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsIn([...MENU_CATEGORIES])
  category?: MenuCategory;

  @IsOptional()
  @IsIn([...STATIONS])
  station?: Station;

  /** Fine sheet category (e.g. `Arrack`) for grouping the POS grid; null clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  menuGroup?: string | null;

  /** Barcode for whole-unit direct-sale items; unique when set, null clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
