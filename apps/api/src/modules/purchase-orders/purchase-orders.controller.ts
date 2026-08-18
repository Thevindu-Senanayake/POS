import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { PurchaseOrderStatus } from '@pos/shared';
import { PurchaseOrderStatusSchema } from '@pos/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { PurchaseOrdersService } from './purchase-orders.service';

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrders: PurchaseOrdersService) {}

  @Get()
  list(@Query('status') status?: string) {
    const parsed = PurchaseOrderStatusSchema.safeParse(status);
    return this.purchaseOrders.list(
      parsed.success ? (parsed.data as PurchaseOrderStatus) : undefined,
    );
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.purchaseOrders.get(id);
  }

  @Post()
  @RequirePermission('goods_receiving')
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.purchaseOrders.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermission('goods_receiving')
  update(@Param('id') id: string, @Body() dto: UpdatePurchaseOrderDto) {
    return this.purchaseOrders.update(id, dto);
  }

  @Post(':id/receive')
  @RequirePermission('goods_receiving')
  receive(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.purchaseOrders.receive(id, userId);
  }

  @Delete(':id')
  @RequirePermission('goods_receiving')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.purchaseOrders.remove(id);
  }
}
