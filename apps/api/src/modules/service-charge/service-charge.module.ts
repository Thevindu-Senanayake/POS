import { Module } from '@nestjs/common';
import { ServiceChargeController } from './service-charge.controller';
import { ServiceChargeService } from './service-charge.service';

@Module({
  controllers: [ServiceChargeController],
  providers: [ServiceChargeService],
  exports: [ServiceChargeService],
})
export class ServiceChargeModule {}
