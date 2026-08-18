import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Move an open session to another (free) table (spec §2.6). Manager action:
 * carries an optional PIN read by PermissionGuard for non-admin callers.
 */
export class TransferTableDto {
  @IsString()
  @MinLength(1)
  toTableId!: string;

  /** Read by PermissionGuard when the caller's role requires a PIN. */
  @IsOptional()
  @IsString()
  managerPin?: string;
}
