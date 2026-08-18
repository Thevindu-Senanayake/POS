import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { AuthUserDTO } from '@pos/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { SetPinDto } from './dto/set-pin.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

/** User & role management — admin only (spec §7). */
@Controller('users')
@Roles('admin')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<AuthUserDTO[]> {
    return this.users.list();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<AuthUserDTO> {
    return this.users.get(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto): Promise<AuthUserDTO> {
    return this.users.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto): Promise<AuthUserDTO> {
    return this.users.update(id, dto);
  }

  @Post(':id/pin')
  setPin(@Param('id') id: string, @Body() dto: SetPinDto): Promise<AuthUserDTO> {
    return this.users.setPin(id, dto.pin);
  }

  @Delete(':id')
  deactivate(@Param('id') id: string): Promise<AuthUserDTO> {
    return this.users.deactivate(id);
  }
}
