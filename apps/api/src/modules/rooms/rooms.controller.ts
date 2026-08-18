import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { RoomDTO } from '@pos/shared';
import { RoomStatusSchema } from '@pos/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { RoomsService } from './rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  // Reads open to any authenticated user (room status board).
  @Get()
  list(
    @Query('status') status?: string,
    @Query('categoryId') categoryId?: string,
  ): Promise<RoomDTO[]> {
    const parsed = RoomStatusSchema.safeParse(status);
    return this.rooms.listRooms({
      status: parsed.success ? parsed.data : undefined,
      categoryId: categoryId || undefined,
    });
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<RoomDTO> {
    return this.rooms.getRoom(id);
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateRoomDto): Promise<RoomDTO> {
    return this.rooms.createRoom(dto);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateRoomDto): Promise<RoomDTO> {
    return this.rooms.updateRoom(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.rooms.deleteRoom(id);
  }
}
