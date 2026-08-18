import { IsOptional, IsString } from 'class-validator';

/** Open a table session. Defaults the waiter to the caller when omitted. */
export class OpenSessionDto {
  @IsOptional()
  @IsString()
  waiterId?: string;
}
