import { Module } from '@nestjs/common';
import { RoomCategoriesController } from './room-categories.controller';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [RoomCategoriesController, RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
