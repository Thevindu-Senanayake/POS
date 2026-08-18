import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { STATIONS } from '@pos/shared';
import type { Station } from '@pos/shared';

/** Agent reports a claimed job printed successfully. */
export class ReportDoneDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  agentId?: string;

  /** Printer whose health to mark online; defaults to the job's own station. */
  @IsOptional()
  @IsIn([...STATIONS])
  station?: Station;
}

/** Agent reports a claimed job failed (unreachable printer, render error, ...). */
export class ReportFailedDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  agentId?: string;

  /** Printer whose health to mark offline; defaults to the job's own station. */
  @IsOptional()
  @IsIn([...STATIONS])
  station?: Station;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  error!: string;
}
