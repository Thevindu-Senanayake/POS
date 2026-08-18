import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
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

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
