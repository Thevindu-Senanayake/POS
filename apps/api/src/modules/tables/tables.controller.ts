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
import type { DiningTableDTO, TableArea, TableSessionDTO } from '@pos/shared';
import { TableAreaSchema } from '@pos/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateTableDto } from './dto/create-table.dto';
import { OpenSessionDto } from './dto/open-session.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { TablesService } from './tables.service';

@Controller('tables')
export class TablesController {
  constructor(private readonly tables: TablesService) {}

  // Reads are open to any authenticated user (floor board needs table visibility).
  @Get()
  list(@Query('area') area?: string): Promise<DiningTableDTO[]> {
    const parsed = TableAreaSchema.safeParse(area);
    return this.tables.listTables(parsed.success ? (parsed.data as TableArea) : undefined);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<DiningTableDTO> {
    return this.tables.getTable(id);
  }

  // Floor layout config is admin-only (spec §7).
  @Post()
  @Roles('admin')
  create(@Body() dto: CreateTableDto): Promise<DiningTableDTO> {
    return this.tables.createTable(dto);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateTableDto): Promise<DiningTableDTO> {
    return this.tables.updateTable(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.tables.deleteTable(id);
  }

  // Opening a session and clearing a cleaned table are routine floor actions.
  @Post(':id/session')
  @RequirePermission('take_orders')
  openSession(
    @Param('id') id: string,
    @Body() dto: OpenSessionDto,
    @CurrentUser('userId') userId: string,
  ): Promise<TableSessionDTO> {
    return this.tables.openSession(id, dto.waiterId, userId);
  }

  @Post(':id/clean')
  @RequirePermission('take_orders')
  clean(@Param('id') id: string): Promise<DiningTableDTO> {
    return this.tables.cleanTable(id);
  }
}
