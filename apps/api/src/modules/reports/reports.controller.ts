import { Controller, Get, Query } from '@nestjs/common';
import type {
  AuditLogDTO,
  DashboardSummaryDTO,
  LowStockRowDTO,
  SalesReportDTO,
  VarianceRowDTO,
} from '@pos/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';

/**
 * Reporting endpoints (spec §5, §2.8) — admin only (class-level `@Roles`).
 * All reads; the date parsing, grouping and ledger math live in the service.
 */
@Controller('reports')
@Roles('admin')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  sales(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy') groupBy?: string,
  ): Promise<SalesReportDTO> {
    return this.reports.salesReport({ from, to, groupBy });
  }

  @Get('variance')
  variance(@Query('from') from?: string, @Query('to') to?: string): Promise<VarianceRowDTO[]> {
    return this.reports.varianceReport({ from, to });
  }

  @Get('low-stock')
  lowStock(): Promise<LowStockRowDTO[]> {
    return this.reports.lowStockReport();
  }

  @Get('dashboard')
  dashboard(): Promise<DashboardSummaryDTO> {
    return this.reports.dashboard();
  }

  @Get('audit')
  audit(
    @Query('action') action?: string,
    @Query('limit') limit?: string,
  ): Promise<AuditLogDTO[]> {
    const n = limit !== undefined && Number.isFinite(Number(limit)) ? Number(limit) : undefined;
    return this.reports.auditLog({ action, limit: n });
  }
}
