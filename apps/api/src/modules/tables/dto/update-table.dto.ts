import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { TABLE_AREAS, TABLE_STATUSES } from '@pos/shared';
import type { TableArea, TableStatus } from '@pos/shared';

/** Patch a table's layout fields or status (admin). All fields optional. */
export class UpdateTableDto {
  @IsOptional()
  @IsIn([...TABLE_AREAS])
  area?: TableArea;

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
