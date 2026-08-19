import { Module } from '@nestjs/common';
import { MenuController, MenuScanController } from './menu.controller';
import { MenuService } from './menu.service';

@Module({
  controllers: [MenuController, MenuScanController],
  providers: [MenuService],
  exports: [MenuService],
})
export class MenuModule {}
