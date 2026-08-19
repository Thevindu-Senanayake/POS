import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PRINTER_CONNECTIONS } from '@pos/shared';
import type { PrinterConnection } from '@pos/shared';

/** Admin edit of a printer's config/health (spec §3.2 printer↔role map). */
export class UpdatePrinterDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  /** How the agent reaches this printer: `network` (ip:port) or `usb` (OS spooler by name). */
  @IsOptional()
  @IsIn([...PRINTER_CONNECTIONS])
  connection?: PrinterConnection;

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

  /** USB / OS-spooler printer name (used when `connection` is `usb`); null clears it. */
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(120)
  device?: string | null;

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
