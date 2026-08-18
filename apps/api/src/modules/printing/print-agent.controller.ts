import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { PrinterDTO, PrintJobAgentDTO, PrintJobDTO } from '@pos/shared';
import { Public } from '../../common/decorators/public.decorator';
import { ClaimJobsDto } from './dto/claim-jobs.dto';
import { ReportDoneDto, ReportFailedDto } from './dto/report-job.dto';
import { PrintAgentGuard } from './print-agent.guard';
import { PrintingService } from './printing.service';

/**
 * Endpoints for the LAN print-agent (spec §3). `@Public()` skips the global JWT
 * guards; {@link PrintAgentGuard} authenticates via the shared PRINT_AGENT_TOKEN.
 * Claim/report are POSTs that return 200 (RPC-style, not resource creation).
 */
@Controller('printing/agent')
@Public()
@UseGuards(PrintAgentGuard)
export class PrintAgentController {
  constructor(private readonly printing: PrintingService) {}

  @Post('claim')
  @HttpCode(200)
  claim(@Body() dto: ClaimJobsDto): Promise<PrintJobAgentDTO[]> {
    return this.printing.claim(dto);
  }

  @Post('jobs/:id/done')
  @HttpCode(200)
  done(@Param('id') id: string, @Body() dto: ReportDoneDto): Promise<PrintJobDTO> {
    return this.printing.reportDone(id, dto);
  }

  @Post('jobs/:id/failed')
  @HttpCode(200)
  failed(@Param('id') id: string, @Body() dto: ReportFailedDto): Promise<PrintJobDTO> {
    return this.printing.reportFailed(id, dto);
  }

  @Get('printers')
  printers(): Promise<PrinterDTO[]> {
    return this.printing.listPrinters();
  }
}
