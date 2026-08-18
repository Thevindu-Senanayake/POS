import { IsOptional, IsString } from 'class-validator';

/** Reason for a void/cancel (spec §8). Carries an optional manager PIN. */
export class VoidDto {
  @IsOptional()
  @IsString()
  reason?: string;

  /** Read by PermissionGuard when the caller's role requires a PIN. */
  @IsOptional()
  @IsString()
  managerPin?: string;
}
