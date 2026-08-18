import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/** Admin edit of a printer's config/health (spec §3.2 printer↔station map). */
export class UpdatePrinterDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  /** LAN address; may be set to null to clear (falls back to stdout in the agent). */
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(64)
  ip?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  /** ESC/POS profile the agent renders with (e.g. `epson`, `star`). */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  type?: string;

  /** Manual override to clear a stuck "offline" (agent reports normally manage this). */
  @IsOptional()
  @IsBoolean()
  online?: boolean;
}
