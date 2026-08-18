import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/** Edit a still-draft line (before it is sent to the kitchen). */
export class UpdateOrderItemDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
