import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { TableSessionDTO } from '@pos/shared';
import { CurrentUser, ManagerApprover } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { MergeSessionsDto } from './dto/merge-sessions.dto';
import { TransferTableDto } from './dto/transfer-table.dto';
import { TablesService } from './tables.service';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly tables: TablesService) {}

  @Get()
  list(@Query('open') open?: string): Promise<TableSessionDTO[]> {
    return this.tables.listSessions(open === 'true');
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<TableSessionDTO> {
    return this.tables.getSession(id);
  }

  @Post(':id/close')
  @RequirePermission('take_orders')
  close(@Param('id') id: string): Promise<TableSessionDTO> {
    return this.tables.closeSession(id);
  }

  // Transfer + merge are the spec §7 "split/merge table" manager actions.
  @Post(':id/transfer')
  @RequirePermission('split_merge')
  transfer(
    @Param('id') id: string,
    @Body() dto: TransferTableDto,
    @CurrentUser('userId') userId: string,
    @ManagerApprover() approverId: string | undefined,
  ): Promise<TableSessionDTO> {
    return this.tables.transfer(id, dto.toTableId, userId, approverId);
  }

  @Post(':id/merge')
  @RequirePermission('split_merge')
  merge(
    @Param('id') id: string,
    @Body() dto: MergeSessionsDto,
    @CurrentUser('userId') userId: string,
    @ManagerApprover() approverId: string | undefined,
  ): Promise<TableSessionDTO> {
    return this.tables.merge(id, dto.sourceSessionId, userId, approverId);
  }
}
