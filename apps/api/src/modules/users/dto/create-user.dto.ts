import { IsBoolean, IsIn, IsOptional, IsString, Length, MinLength } from 'class-validator';
import { USER_ROLES, type UserRole } from '@pos/shared';

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsIn([...USER_ROLES])
  role!: UserRole;

  /** Optional manager/admin override PIN. */
  @IsOptional()
  @IsString()
  @Length(4, 8)
  pin?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
