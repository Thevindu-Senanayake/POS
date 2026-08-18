import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SessionsController } from './sessions.controller';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';

@Module({
  imports: [AuditModule],
  controllers: [TablesController, SessionsController],
  providers: [TablesService],
  exports: [TablesService],
})
export class TablesModule {}
