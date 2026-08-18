import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { USER_ROLES, type UserRole } from '@pos/shared';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsIn([...USER_ROLES])
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
