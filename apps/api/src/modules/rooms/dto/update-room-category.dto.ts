import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

/** Patch a room category (admin). All fields optional. */
export class UpdateRoomCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultRate?: number;
}
