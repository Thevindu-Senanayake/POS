import { IsNumber, IsString, Min, MinLength } from 'class-validator';

/** Create a room category with a default nightly rate (admin). */
export class CreateRoomCategoryDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsNumber()
  @Min(0)
  defaultRate!: number;
}
