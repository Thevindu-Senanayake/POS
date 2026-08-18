import { IsNumber, Max, Min } from 'class-validator';

export class UpdateServiceChargeDto {
  /** Percentage 0–100, e.g. 10 = 10%. */
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage!: number;
}
