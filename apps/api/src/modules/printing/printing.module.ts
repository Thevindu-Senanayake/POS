import { Module } from '@nestjs/common';
import { PrintAgentController } from './print-agent.controller';
import { PrintAgentGuard } from './print-agent.guard';
import { PrintingController } from './printing.controller';
import { PrintingService } from './printing.service';

@Module({
  controllers: [PrintingController, PrintAgentController],
  providers: [PrintingService, PrintAgentGuard],
  exports: [PrintingService],
})
export class PrintingModule {}
