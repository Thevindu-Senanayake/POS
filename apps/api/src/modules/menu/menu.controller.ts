import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { Channel, MenuCategory } from '@pos/shared';
import { ChannelSchema, MenuCategorySchema } from '@pos/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { SetPricesDto } from './dto/set-prices.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { MenuService } from './menu.service';

@Controller('menu-items')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  list(
    @Query('category') category?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const parsed = MenuCategorySchema.safeParse(category);
    return this.menu.list({
      category: parsed.success ? (parsed.data as MenuCategory) : undefined,
      includeInactive: includeInactive === 'true',
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.menu.get(id);
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateMenuItemDto) {
    return this.menu.create(dto);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateMenuItemDto) {
    return this.menu.update(id, dto);
  }

  @Put(':id/prices')
  @Roles('admin')
  setPrices(@Param('id') id: string, @Body() dto: SetPricesDto) {
    return this.menu.setPrices(id, dto.prices);
  }

  @Delete(':id/prices/:channel')
  @Roles('admin')
  @HttpCode(204)
  async removePrice(
    @Param('id') id: string,
    @Param('channel') channel: string,
  ) {
    const parsed = ChannelSchema.safeParse(channel);
    if (!parsed.success) {
      throw new BadRequestException('Invalid channel');
    }
    await this.menu.removePrice(id, parsed.data as Channel);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.menu.remove(id);
  }
}

/**
 * `GET /api/menu/scan?code=<barcode>` — bar USB-scanner lookup (spec feature (c)).
 * Kept off `menu-items/:id` so the literal `scan` path can't shadow an id route.
 * Any authenticated user (the global JWT guard applies); no admin role required.
 */
@Controller('menu')
export class MenuScanController {
  constructor(private readonly menu: MenuService) {}

  @Get('scan')
  scan(@Query('code') code?: string) {
    return this.menu.scan(code ?? '');
  }
}
