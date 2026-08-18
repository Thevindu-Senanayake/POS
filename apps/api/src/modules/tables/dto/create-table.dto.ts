import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { TABLE_AREAS } from '@pos/shared';
import type { TableArea } from '@pos/shared';

/** Create a physical dining table (admin — floor layout config). */
export class CreateTableDto {
  @IsIn([...TABLE_AREAS])
  area!: TableArea;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  capacity?: number;
}
