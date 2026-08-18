import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { RoomCategoryDTO } from '@pos/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateRoomCategoryDto } from './dto/create-room-category.dto';
import { UpdateRoomCategoryDto } from './dto/update-room-category.dto';
import { RoomsService } from './rooms.service';

@Controller('room-categories')
export class RoomCategoriesController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  list(): Promise<RoomCategoryDTO[]> {
    return this.rooms.listCategories();
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateRoomCategoryDto): Promise<RoomCategoryDTO> {
    return this.rooms.createCategory(dto);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateRoomCategoryDto): Promise<RoomCategoryDTO> {
    return this.rooms.updateCategory(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.rooms.deleteCategory(id);
  }
}
