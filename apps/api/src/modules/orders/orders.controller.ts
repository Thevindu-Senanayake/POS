import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { OrderStatus } from '@pos/shared';
import { OrderStatusSchema } from '@pos/shared';
import { CurrentUser, ManagerApprover } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AddItemsDto } from './dto/add-items.dto';
import { ApplyDiscountDto } from './dto/apply-discount.dto';
import { ChargeToRoomDto } from './dto/charge-to-room.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { ItemSelectionDto } from './dto/item-selection.dto';
import { PayDto } from './dto/pay.dto';
import { SplitBillDto } from './dto/split-bill.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { VoidDto } from './dto/void.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query('status') status?: string) {
    const parsed = OrderStatusSchema.safeParse(status);
    return this.orders.list(parsed.success ? (parsed.data as OrderStatus) : undefined);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.orders.get(id);
  }

  @Get(':id/bills')
  bills(@Param('id') id: string) {
    return this.orders.listBills(id);
  }

  @Post()
  @RequirePermission('take_orders')
  create(@Body() dto: CreateOrderDto, @CurrentUser('userId') userId: string) {
    return this.orders.create(dto, userId);
  }

  @Post(':id/items')
  @RequirePermission('take_orders')
  addItems(
    @Param('id') id: string,
    @Body() dto: AddItemsDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.orders.addItems(id, dto.items, userId);
  }

  @Patch(':id/items/:itemId')
  @RequirePermission('take_orders')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateOrderItemDto,
  ) {
    return this.orders.updateItem(id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  @RequirePermission('take_orders')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.orders.removeDraftItem(id, itemId);
  }

  @Post(':id/send')
  @RequirePermission('send_kot')
  send(
    @Param('id') id: string,
    @Body() dto: ItemSelectionDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.orders.sendToKitchen(id, dto.itemIds, userId);
  }

  @Post(':id/serve')
  @RequirePermission('mark_served')
  serve(
    @Param('id') id: string,
    @Body() dto: ItemSelectionDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.orders.serve(id, dto.itemIds, userId);
  }

  @Post(':id/request-bill')
  @RequirePermission('request_bill')
  requestBill(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.orders.requestBill(id, userId);
  }

  @Post(':id/items/:itemId/void')
  @RequirePermission('void')
  voidItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: VoidDto,
    @CurrentUser('userId') userId: string,
    @ManagerApprover() approverId: string | undefined,
  ) {
    return this.orders.voidItem(id, itemId, dto.reason, userId, approverId);
  }

  @Post(':id/cancel')
  @RequirePermission('void')
  cancel(
    @Param('id') id: string,
    @Body() dto: VoidDto,
    @CurrentUser('userId') userId: string,
    @ManagerApprover() approverId: string | undefined,
  ) {
    return this.orders.cancelOrder(id, dto.reason, userId, approverId);
  }

  @Post(':id/discounts')
  @RequirePermission('apply_discount')
  applyDiscount(
    @Param('id') id: string,
    @Body() dto: ApplyDiscountDto,
    @CurrentUser('userId') userId: string,
    @ManagerApprover() approverId: string | undefined,
  ) {
    return this.orders.applyDiscount(id, dto, userId, approverId);
  }

  @Delete(':id/discounts/:discountId')
  @RequirePermission('apply_discount')
  removeDiscount(
    @Param('id') id: string,
    @Param('discountId') discountId: string,
  ) {
    return this.orders.removeDiscount(id, discountId);
  }

  @Post(':id/pay')
  @RequirePermission('take_payment')
  pay(
    @Param('id') id: string,
    @Body() dto: PayDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.orders.pay(id, dto, userId);
  }

  @Post(':id/charge-to-room')
  @RequirePermission('take_payment')
  chargeToRoom(
    @Param('id') id: string,
    @Body() dto: ChargeToRoomDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.orders.chargeToRoom(id, dto, userId);
  }

  @Post(':id/split')
  @RequirePermission('split_merge')
  split(
    @Param('id') id: string,
    @Body() dto: SplitBillDto,
    @CurrentUser('userId') userId: string,
    @ManagerApprover() approverId: string | undefined,
  ) {
    return this.orders.split(id, dto, userId, approverId);
  }
}
