import { Body, Controller, Get, Put } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UpdateOutletDto } from './dto/update-outlet.dto';
import { OutletService } from './outlet.service';

@Controller('outlet')
export class OutletController {
  constructor(private readonly outlet: OutletService) {}

  /** Any authenticated user may read the outlet (the receipt renderer + admin form). */
  @Get()
  get() {
    return this.outlet.get();
  }

  /** Only admins may edit the business identity / receipt customisation. */
  @Put()
  @Roles('admin')
  update(@Body() dto: UpdateOutletDto) {
    return this.outlet.update(dto);
  }
}
