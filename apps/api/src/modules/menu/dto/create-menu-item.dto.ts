import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CHANNELS, MENU_CATEGORIES, STATIONS } from '@pos/shared';
import type { Channel, MenuCategory, Station } from '@pos/shared';

export class MenuItemPriceInput {
  @IsIn([...CHANNELS])
  channel!: Channel;

  @IsNumber()
  @Min(0)
  price!: number;
}

export class CreateMenuItemDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn([...MENU_CATEGORIES])
  category!: MenuCategory;

  /** KOT routing station; defaults from the category when omitted. */
  @IsOptional()
  @IsIn([...STATIONS])
  station?: Station;

  /** Fine sheet category (e.g. `Arrack`) for grouping the POS grid. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  menuGroup?: string | null;

  /** Barcode for whole-unit direct-sale items (bottles/cans); unique when set. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemPriceInput)
  prices?: MenuItemPriceInput[];
}
