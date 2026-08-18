import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { MenuItemPriceInput } from './create-menu-item.dto';

/** Upserts the given channel prices; channels not listed are left untouched. */
export class SetPricesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MenuItemPriceInput)
  prices!: MenuItemPriceInput[];
}
