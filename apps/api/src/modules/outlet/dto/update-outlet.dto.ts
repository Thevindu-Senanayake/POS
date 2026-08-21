import { IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * Partial update of the singleton outlet's identity + receipt customisation.
 * Every field is optional; `@IsOptional()` also permits `null` to clear a text
 * line. Booleans are the per-line "show on receipt" toggles.
 */
export class UpdateOutletDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  tagline?: string | null;

  @IsOptional()
  @IsString()
  taxNumber?: string | null;

  @IsOptional()
  @IsString()
  receiptFooter?: string | null;

  @IsOptional()
  @IsString()
  receiptCurrencyLabel?: string | null;

  @IsOptional()
  @IsBoolean()
  showName?: boolean;

  @IsOptional()
  @IsBoolean()
  showTagline?: boolean;

  @IsOptional()
  @IsBoolean()
  showAddress?: boolean;

  @IsOptional()
  @IsBoolean()
  showPhone?: boolean;

  @IsOptional()
  @IsBoolean()
  showTaxNumber?: boolean;

  @IsOptional()
  @IsBoolean()
  showFooter?: boolean;

  @IsOptional()
  @IsBoolean()
  showCurrencyLabel?: boolean;

  @IsOptional()
  @IsBoolean()
  showLogo?: boolean;
}
