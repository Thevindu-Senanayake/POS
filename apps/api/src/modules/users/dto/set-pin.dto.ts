import { IsString, Length } from 'class-validator';

export class SetPinDto {
  @IsString()
  @Length(4, 8)
  pin!: string;
}
