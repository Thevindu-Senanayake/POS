import { IsArray, IsOptional, IsString } from 'class-validator';

/**
 * Optional subset of line ids for send-to-kitchen / mark-served. Omitting it
 * applies to every eligible line on the order.
 */
export class ItemSelectionDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemIds?: string[];
}
