import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ServiceChargeModule } from '../service-charge/service-charge.module';
import { StockModule } from '../stock/stock.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [StockModule, AuditModule, ServiceChargeModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
