import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { PrinterDTO, PrintJobDTO } from '@pos/shared';
import { PrintJobStatusSchema } from '@pos/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { UpdatePrinterDto } from './dto/update-printer.dto';
import { PrintingService } from './printing.service';

/** Admin view of the print queue and printer health (spec §3.3, §5). Admin-only. */
@Controller('printing')
@Roles('admin')
export class PrintingController {
  constructor(private readonly printing: PrintingService) {}

  @Get('jobs')
  listJobs(@Query('status') status?: string, @Query('limit') limit?: string): Promise<PrintJobDTO[]> {
    const parsed = PrintJobStatusSchema.safeParse(status);
    const n = limit ? parseInt(limit, 10) : NaN;
    return this.printing.listJobs({
      status: parsed.success ? parsed.data : undefined,
      limit: Number.isFinite(n) && n > 0 ? Math.min(n, 500) : undefined,
    });
  }

  @Post('jobs/:id/retry')
  retry(@Param('id') id: string): Promise<PrintJobDTO> {
    return this.printing.retryJob(id);
  }

  @Get('printers')
  listPrinters(): Promise<PrinterDTO[]> {
    return this.printing.listPrinters();
  }

  @Patch('printers/:id')
  updatePrinter(@Param('id') id: string, @Body() dto: UpdatePrinterDto): Promise<PrinterDTO> {
    return this.printing.updatePrinter(id, dto);
  }
}
