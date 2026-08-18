import { Module } from '@nestjs/common';
import { StockLedgerService } from './stock-ledger.service';

/** Provides the shared stock ledger writer to any module that mutates stock. */
@Module({
  providers: [StockLedgerService],
  exports: [StockLedgerService],
})
export class StockModule {}
