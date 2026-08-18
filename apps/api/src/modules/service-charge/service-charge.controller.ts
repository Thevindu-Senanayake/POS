import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
} from '@nestjs/common';
import type { Channel } from '@pos/shared';
import { ChannelSchema } from '@pos/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { UpdateServiceChargeDto } from './dto/update-service-charge.dto';
import { ServiceChargeService } from './service-charge.service';

@Controller('service-charges')
export class ServiceChargeController {
  constructor(private readonly serviceCharge: ServiceChargeService) {}

  @Get()
  list() {
    return this.serviceCharge.list();
  }

  @Put(':channel')
  @Roles('admin')
  upsert(
    @Param('channel') channel: string,
    @Body() dto: UpdateServiceChargeDto,
  ) {
    const parsed = ChannelSchema.safeParse(channel);
    if (!parsed.success) {
      throw new BadRequestException('Invalid channel');
    }
    return this.serviceCharge.upsert(parsed.data as Channel, dto.percentage);
  }
}
