import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { TABLE_STATUSES } from '@pos/shared';
import type { TableStatus } from '@pos/shared';

/** Patch a table's layout fields or status (admin). All fields optional. */
export class UpdateTableDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  capacity?: number;

  @IsOptional()
  @IsIn([...TABLE_STATUSES])
  status?: TableStatus;
}
