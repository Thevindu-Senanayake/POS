import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Print-agent poll (spec §3): claim up to `limit` jobs that are due to print. */
export class ClaimJobsDto {
  /** Agent identifier stamped on claimed jobs (`claimedBy`); distinguishes agents. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  agentId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
