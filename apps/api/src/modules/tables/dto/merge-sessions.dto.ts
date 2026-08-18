import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Merge another open session's orders into this one before billing (spec §2.6).
 * Manager action: carries an optional PIN read by PermissionGuard for non-admins.
 */
export class MergeSessionsDto {
  /** The session whose orders are folded into the target and then closed. */
  @IsString()
  @MinLength(1)
  sourceSessionId!: string;

  /** Read by PermissionGuard when the caller's role requires a PIN. */
  @IsOptional()
  @IsString()
  managerPin?: string;
}
