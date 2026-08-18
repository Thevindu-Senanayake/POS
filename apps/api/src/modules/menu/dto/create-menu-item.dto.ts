import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemPriceInput)
  prices?: MenuItemPriceInput[];
}
