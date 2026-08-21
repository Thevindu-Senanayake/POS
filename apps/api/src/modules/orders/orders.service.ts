import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@pos/db';
import type { Outlet } from '@pos/db';
import type {
  BillDTO,
  Channel,
  KotCreatedEvent,
  LowStockEvent,
  OrderDTO,
  OrderStatus,
  PaymentMethod,
} from '@pos/shared';
import { DEFAULT_CURRENCY_SYMBOL, resolveChannelPrice, round2, sumMoney } from '@pos/shared';
import { decToNum } from '../../common/decimal';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BookingsService } from '../bookings/bookings.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ServiceChargeService } from '../service-charge/service-charge.service';
import { StockLedgerService } from '../stock/stock-ledger.service';
import { ApplyDiscountDto } from './dto/apply-discount.dto';
import { ChargeToRoomDto } from './dto/charge-to-room.dto';
import { CreateOrderDto, OrderItemInput } from './dto/create-order.dto';
import { PayDto } from './dto/pay.dto';
import { SplitBillDto } from './dto/split-bill.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import {
  allocateProportional,
  computeOrderTotals,
  lineTotalOf,
  resolveDiscountAmount,
  type TotalsDiscount,
  type TotalsLine,
} from './order-totals';

const ORDER_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' },
    include: { menuItem: { select: { name: true } } },
  },
  discounts: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;
type OrderItemWithMenu = OrderWithRelations['items'][number];

const BILL_INCLUDE = {
  items: { orderBy: { id: 'asc' } },
  payments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.BillInclude;

type BillWithRelations = Prisma.BillGetPayload<{ include: typeof BILL_INCLUDE }>;

/** Order statuses from which no further billing/serving is allowed. */
const FINAL_STATUSES: OrderStatus[] = ['paid', 'cancelled'];
/** Statuses an order must be in to be billed/paid (stock already deducted). */
const PAYABLE_STATUSES: OrderStatus[] = ['sent_to_kitchen', 'served', 'bill_requested'];

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: StockLedgerService,
    private readonly audit: AuditService,
    private readonly serviceCharge: ServiceChargeService,
    private readonly bookings: BookingsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // --- Reads -------------------------------------------------------------

  async list(status?: OrderStatus): Promise<OrderDTO[]> {
    const orders = await this.prisma.order.findMany({
      where: status ? { status } : undefined,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    const pctByChannel = await this.serviceChargePctByChannel(
      orders.map((o) => o.channel),
    );
    return orders.map((o) => this.toOrderDTO(o, pctByChannel[o.channel] ?? 0));
  }

  async get(id: string): Promise<OrderDTO> {
    const order = await this.loadOrderOrThrow(id);
    return this.orderDTO(order);
  }

  async listBills(orderId: string): Promise<BillDTO[]> {
    await this.loadOrderOrThrow(orderId);
    const bills = await this.prisma.bill.findMany({
      where: { orderId },
      include: BILL_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return bills.map((b) => this.toBillDTO(b));
  }

  // --- Order building ----------------------------------------------------

  async create(dto: CreateOrderDto, userId: string): Promise<OrderDTO> {
    if (dto.tableSessionId) {
      await this.assertSessionOpen(dto.tableSessionId);
    }
    if (dto.bookingId) {
      await this.assertBookingActive(dto.bookingId);
    }
    const itemsData =
      dto.items && dto.items.length > 0
        ? await this.buildOrderItems(dto.channel, dto.items)
        : [];

    const order = await this.prisma.order.create({
      data: {
        channel: dto.channel,
        tableSessionId: dto.tableSessionId ?? null,
        bookingId: dto.bookingId ?? null,
        notes: dto.notes ?? null,
        createdById: userId,
        items: itemsData.length > 0 ? { create: itemsData } : undefined,
      },
      include: ORDER_INCLUDE,
    });
    if (order.tableSessionId) this.realtime.emitTablesUpdated();
    return this.emitOrderDTO(order);
  }

  async addItems(
    id: string,
    items: OrderItemInput[],
    _userId: string,
  ): Promise<OrderDTO> {
    const order = await this.loadOrderOrThrow(id);
    this.assertNotFinal(order);
    const data = await this.buildOrderItems(order.channel, items);
    await this.prisma.orderItem.createMany({
      data: data.map((d) => ({ ...d, orderId: id })),
    });
    return this.emitOrderDTO(await this.loadOrderOrThrow(id));
  }

  async updateItem(
    id: string,
    itemId: string,
    dto: UpdateOrderItemDto,
  ): Promise<OrderDTO> {
    const order = await this.loadOrderOrThrow(id);
    const item = this.findItem(order, itemId);
    if (item.status !== 'draft') {
      throw new ConflictException('Only draft items can be edited');
    }
    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: {
        ...(dto.qty !== undefined ? { qty: dto.qty } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
    return this.emitOrderDTO(await this.loadOrderOrThrow(id));
  }

  async removeDraftItem(id: string, itemId: string): Promise<OrderDTO> {
    const order = await this.loadOrderOrThrow(id);
    const item = this.findItem(order, itemId);
    if (item.status !== 'draft') {
      throw new ConflictException(
        'Only draft items can be deleted; sent items must be voided',
      );
    }
    await this.prisma.orderItem.delete({ where: { id: itemId } });
    return this.emitOrderDTO(await this.loadOrderOrThrow(id));
  }

  // --- Kitchen lifecycle -------------------------------------------------

  /**
   * Send draft lines to the kitchen/bar (spec §2.6): deduct stock via the ledger
   * for every recipe line, flip items + order to sent_to_kitchen, and enqueue one
   * KOT print job per distinct station. All-or-nothing in a single transaction.
   * Stock is NEVER deducted on draft.
   */
  async sendToKitchen(
    id: string,
    itemIds: string[] | undefined,
    userId: string,
  ): Promise<OrderDTO> {
    const kotEvents: KotCreatedEvent[] = [];
    const lowStockEvents: LowStockEvent[] = [];
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: { items: { include: { menuItem: { select: { name: true } } } } },
      });
      if (!order) throw new NotFoundException('Order not found');
      if (FINAL_STATUSES.includes(order.status)) {
        throw new ConflictException(`Cannot send a ${order.status} order`);
      }

      const draft = order.items.filter(
        (it) => it.status === 'draft' && (!itemIds || itemIds.includes(it.id)),
      );
      if (draft.length === 0) {
        throw new BadRequestException('No draft items to send');
      }

      const recipesByMenu = await this.loadRecipes(
        tx,
        draft.map((it) => it.menuItemId),
      );

      // Pre-deduction stock per ingredient (captured on first sighting, so it
      // reflects the level before any of this send's deductions) — used below
      // to flag reorder-level crossings.
      const preStock = new Map<string, number>();
      for (const item of draft) {
        const recipes = recipesByMenu.get(item.menuItemId) ?? [];
        for (const recipe of recipes) {
          const ingredient = await tx.ingredient.findUniqueOrThrow({
            where: { id: recipe.ingredientId },
          });
          if (!preStock.has(ingredient.id)) {
            preStock.set(ingredient.id, decToNum(ingredient.currentStock));
          }
          const deduction = new Prisma.Decimal(recipe.quantity).times(item.qty);
          await this.ledger.applyMovement(tx, {
            ingredientId: recipe.ingredientId,
            changeQty: deduction.negated(),
            reason: 'sale',
            refType: 'order_item',
            refId: item.id,
            unitCostAtTime: new Prisma.Decimal(ingredient.costPerUnit),
            createdById: userId,
          });
        }
        await tx.orderItem.update({
          where: { id: item.id },
          data: { status: 'sent_to_kitchen', sentAt: new Date() },
        });
      }

      // Low-stock crossings (spec §2.8): re-read affected ingredients and flag
      // any that fell to/below their reorder level as a result of this send.
      // Only the crossing edge is reported (was above, now at/below) so an
      // already-low ingredient doesn't re-alert on every subsequent send.
      const affectedIds = [...preStock.keys()];
      if (affectedIds.length > 0) {
        const after = await tx.ingredient.findMany({
          where: { id: { in: affectedIds } },
        });
        for (const ing of after) {
          const before = preStock.get(ing.id)!;
          const reorder = decToNum(ing.reorderLevel);
          const current = decToNum(ing.currentStock);
          if (reorder > 0 && current <= reorder && before > reorder) {
            lowStockEvents.push({
              ingredientId: ing.id,
              name: ing.name,
              currentStock: current,
              reorderLevel: reorder,
              unit: ing.baseUnit,
            });
          }
        }
      }

      await tx.order.update({
        where: { id },
        data: { status: 'sent_to_kitchen' },
      });

      const tableName = await this.resolveTableName(tx, order.tableSessionId);
      const stations = [...new Set(draft.map((it) => it.station))];
      for (const station of stations) {
        const stationItems = draft.filter((it) => it.station === station);
        await tx.printJob.create({
          data: {
            type: 'kot',
            station,
            orderId: order.id,
            payload: this.buildKotPayload(
              order.id,
              order.channel,
              station,
              tableName,
              order.notes,
              stationItems,
            ),
          },
        });
        kotEvents.push({
          orderId: order.id,
          channel: order.channel,
          station,
          tableName,
          items: stationItems.map((it) => ({
            name: it.menuItem.name,
            qty: it.qty,
            notes: it.notes,
          })),
        });
      }
    });

    // Post-commit: broadcast one KOT per station (drives the KDS), any low-stock
    // crossings (drives the admin alert), then the order.
    for (const event of kotEvents) this.realtime.emitKotCreated(event);
    for (const event of lowStockEvents) this.realtime.emitLowStock(event);
    return this.emitOrderDTO(await this.loadOrderOrThrow(id));
  }

  /** Mark sent lines as served; when every active line is served, so is the order. */
  async serve(
    id: string,
    itemIds: string[] | undefined,
    _userId: string,
  ): Promise<OrderDTO> {
    const order = await this.loadOrderOrThrow(id);
    if (FINAL_STATUSES.includes(order.status)) {
      throw new ConflictException(`Cannot serve a ${order.status} order`);
    }
    const target = order.items.filter(
      (it) =>
        it.status === 'sent_to_kitchen' && (!itemIds || itemIds.includes(it.id)),
    );
    if (target.length === 0) {
      throw new BadRequestException('No sent items to mark served');
    }

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      for (const item of target) {
        await tx.orderItem.update({
          where: { id: item.id },
          data: { status: 'served', servedAt: now },
        });
      }
      const fresh = await tx.orderItem.findMany({ where: { orderId: id } });
      const active = fresh.filter((it) => it.status !== 'cancelled');
      const allServed =
        active.length > 0 && active.every((it) => it.status === 'served');
      if (allServed) {
        await tx.order.update({ where: { id }, data: { status: 'served' } });
      }
    });

    return this.emitOrderDTO(await this.loadOrderOrThrow(id));
  }

  async requestBill(id: string, _userId: string): Promise<OrderDTO> {
    const order = await this.loadOrderOrThrow(id);
    if (!PAYABLE_STATUSES.includes(order.status)) {
      throw new ConflictException(
        `Cannot request a bill for a ${order.status} order`,
      );
    }
    await this.prisma.order.update({
      where: { id },
      data: { status: 'bill_requested' },
    });
    return this.emitOrderDTO(await this.loadOrderOrThrow(id));
  }

  // --- Void / cancel -----------------------------------------------------

  /** Void a single sent/served line: reverse its stock and audit it (spec §2.6/§8). */
  async voidItem(
    id: string,
    itemId: string,
    reason: string | undefined,
    userId: string,
    approverId: string | undefined,
  ): Promise<OrderDTO> {
    const order = await this.loadOrderOrThrow(id);
    const item = this.findItem(order, itemId);
    if (item.status === 'draft') {
      throw new BadRequestException('Delete draft items instead of voiding them');
    }
    if (item.status === 'cancelled') {
      throw new ConflictException('Item is already voided');
    }
    if (order.status === 'paid') {
      throw new ConflictException('Cannot void an item on a paid order');
    }

    let freedTable = false;
    await this.prisma.$transaction(async (tx) => {
      await this.reverseStockForItem(tx, itemId, userId);
      await tx.discount.deleteMany({ where: { orderItemId: itemId } });
      await tx.orderItem.update({
        where: { id: itemId },
        data: { status: 'cancelled' },
      });
      await this.audit.record(
        {
          action: 'void_item',
          entityType: 'order_item',
          entityId: itemId,
          reason: reason ?? null,
          actorId: userId,
          approverId: approverId ?? null,
          metadata: {
            orderId: id,
            menuItemId: item.menuItemId,
            qty: item.qty,
          },
        },
        tx,
      );
      // Voiding the last live line un-seats the table (back to available).
      freedTable = await this.freeSessionIfEmptied(tx, order.tableSessionId);
    });

    if (freedTable) this.realtime.emitTablesUpdated();
    return this.emitOrderDTO(await this.loadOrderOrThrow(id));
  }

  /** Cancel a whole order: reverse stock for every sent/served line, audit it. */
  async cancelOrder(
    id: string,
    reason: string | undefined,
    userId: string,
    approverId: string | undefined,
  ): Promise<OrderDTO> {
    const order = await this.loadOrderOrThrow(id);
    if (order.status === 'paid') {
      throw new ConflictException('Cannot cancel a paid order');
    }
    if (order.status === 'cancelled') {
      throw new ConflictException('Order is already cancelled');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        if (item.status === 'sent_to_kitchen' || item.status === 'served') {
          await this.reverseStockForItem(tx, item.id, userId);
        }
      }
      await tx.orderItem.updateMany({
        where: { orderId: id, status: { not: 'cancelled' } },
        data: { status: 'cancelled' },
      });
      await tx.order.update({ where: { id }, data: { status: 'cancelled' } });
      await this.audit.record(
        {
          action: 'cancel_order',
          entityType: 'order',
          entityId: id,
          reason: reason ?? null,
          actorId: userId,
          approverId: approverId ?? null,
        },
        tx,
      );
      // If cancelling empties the session with nothing paid, free the table
      // outright; otherwise fall back to the normal used-table close (cleaning).
      const freed = await this.freeSessionIfEmptied(tx, order.tableSessionId);
      if (!freed) await this.maybeCloseSession(tx, order.tableSessionId);
    });

    if (order.tableSessionId) this.realtime.emitTablesUpdated();
    return this.emitOrderDTO(await this.loadOrderOrThrow(id));
  }

  // --- Discounts ---------------------------------------------------------

  async applyDiscount(
    id: string,
    dto: ApplyDiscountDto,
    userId: string,
    approverId: string | undefined,
  ): Promise<OrderDTO> {
    const order = await this.loadOrderOrThrow(id);
    this.assertNotFinal(order);

    let orderItemId: string | null = null;
    if (dto.scope === 'line') {
      if (!dto.orderItemId) {
        throw new BadRequestException('orderItemId is required for a line discount');
      }
      const item = this.findItem(order, dto.orderItemId);
      if (item.status === 'cancelled') {
        throw new BadRequestException('Cannot discount a voided item');
      }
      orderItemId = item.id;
    }

    const base = this.discountBase(order, dto.scope, orderItemId);
    if (base <= 0) {
      throw new BadRequestException('Nothing left to discount');
    }
    const amount = resolveDiscountAmount(dto.type, dto.value, base);
    if (amount <= 0) {
      throw new BadRequestException('Discount resolves to zero');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.discount.create({
        data: {
          scope: dto.scope,
          type: dto.type,
          value: new Prisma.Decimal(dto.value),
          amount: new Prisma.Decimal(amount),
          reason: dto.reason ?? null,
          orderId: id,
          orderItemId,
          approvedById: approverId ?? null,
          createdById: userId,
        },
      });
      await this.audit.record(
        {
          action: 'discount_applied',
          entityType: 'order',
          entityId: id,
          reason: dto.reason ?? null,
          actorId: userId,
          approverId: approverId ?? null,
          metadata: {
            scope: dto.scope,
            type: dto.type,
            value: dto.value,
            amount,
            orderItemId,
          },
        },
        tx,
      );
    });

    return this.emitOrderDTO(await this.loadOrderOrThrow(id));
  }

  async removeDiscount(id: string, discountId: string): Promise<OrderDTO> {
    await this.loadOrderOrThrow(id);
    const discount = await this.prisma.discount.findUnique({
      where: { id: discountId },
    });
    if (!discount || discount.orderId !== id) {
      throw new NotFoundException('Discount not found on this order');
    }
    await this.prisma.discount.delete({ where: { id: discountId } });
    return this.emitOrderDTO(await this.loadOrderOrThrow(id));
  }

  // --- Payment -----------------------------------------------------------

  /** Settle the whole order as one bill (spec §2.6). Tenders must sum to total. */
  async pay(id: string, dto: PayDto, userId: string): Promise<BillDTO> {
    const bill = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: ORDER_INCLUDE,
      });
      if (!order) throw new NotFoundException('Order not found');
      if (order.status === 'paid') {
        throw new ConflictException('Order is already paid');
      }
      if (!PAYABLE_STATUSES.includes(order.status)) {
        throw new ConflictException(`Cannot pay a ${order.status} order`);
      }
      const activeItems = order.items.filter((it) => it.status !== 'cancelled');
      if (activeItems.length === 0) {
        throw new BadRequestException('Order has no billable items');
      }

      const pct = await this.serviceCharge.percentageFor(order.channel);
      const totals = this.computeTotals(order, pct);
      this.assertTendersMatch(dto.payments, totals.total);

      const created = await tx.bill.create({
        data: {
          orderId: id,
          label: dto.label ?? null,
          subtotal: new Prisma.Decimal(totals.subtotal),
          discountTotal: new Prisma.Decimal(totals.discountTotal),
          serviceCharge: new Prisma.Decimal(totals.serviceCharge),
          total: new Prisma.Decimal(totals.total),
          items: {
            create: activeItems.map((it) => ({
              orderItemId: it.id,
              description: it.menuItem.name,
              qty: new Prisma.Decimal(it.qty),
              unitPrice: new Prisma.Decimal(it.unitPrice),
              lineTotal: new Prisma.Decimal(lineTotalOf({
                qty: it.qty,
                unitPrice: decToNum(it.unitPrice),
              })),
            })),
          },
          payments: {
            create: dto.payments.map((p) => ({
              orderId: id,
              method: p.method as PaymentMethod,
              amount: new Prisma.Decimal(p.amount),
              tendered:
                p.method === 'cash' && p.tendered != null
                  ? new Prisma.Decimal(p.tendered)
                  : null,
              reference: p.reference ?? null,
              takenById: userId,
            })),
          },
        },
        include: BILL_INCLUDE,
      });

      await tx.order.update({ where: { id }, data: { status: 'paid' } });
      await this.enqueueBillPrint(tx, order.channel, created, pct);
      await this.maybeCloseSession(tx, order.tableSessionId);
      return created;
    });

    await this.emitAfterSettlement(id);
    return this.toBillDTO(bill);
  }

  /**
   * Settle an order to a guest's room folio instead of taking payment (spec §2.7).
   * Produces the same itemized bill + bill print as {@link pay}, but records a
   * FolioCharge (via the bookings module) rather than Payment rows. The booking is
   * taken from the order (room-service orders carry one) or from the request body
   * for a dine-in order a guest wants on their room. A covered board-plan meal
   * folios at ₨0 — see {@link BookingsService.recordOrderCharge}.
   */
  async chargeToRoom(id: string, dto: ChargeToRoomDto, userId: string): Promise<BillDTO> {
    const bill = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: ORDER_INCLUDE,
      });
      if (!order) throw new NotFoundException('Order not found');
      if (order.status === 'paid') {
        throw new ConflictException('Order is already paid');
      }
      if (!PAYABLE_STATUSES.includes(order.status)) {
        throw new ConflictException(`Cannot settle a ${order.status} order`);
      }
      const activeItems = order.items.filter((it) => it.status !== 'cancelled');
      if (activeItems.length === 0) {
        throw new BadRequestException('Order has no billable items');
      }

      const bookingId = order.bookingId ?? dto.bookingId ?? null;
      if (!bookingId) {
        throw new BadRequestException(
          'No booking to charge; pass bookingId or attach the order to a booking',
        );
      }

      const pct = await this.serviceCharge.percentageFor(order.channel);
      const totals = this.computeTotals(order, pct);

      const created = await tx.bill.create({
        data: {
          orderId: id,
          label: dto.label ?? null,
          subtotal: new Prisma.Decimal(totals.subtotal),
          discountTotal: new Prisma.Decimal(totals.discountTotal),
          serviceCharge: new Prisma.Decimal(totals.serviceCharge),
          total: new Prisma.Decimal(totals.total),
          items: {
            create: activeItems.map((it) => ({
              orderItemId: it.id,
              description: it.menuItem.name,
              qty: new Prisma.Decimal(it.qty),
              unitPrice: new Prisma.Decimal(it.unitPrice),
              lineTotal: new Prisma.Decimal(lineTotalOf({
                qty: it.qty,
                unitPrice: decToNum(it.unitPrice),
              })),
            })),
          },
        },
        include: BILL_INCLUDE,
      });

      await this.bookings.recordOrderCharge(tx, {
        bookingId,
        channel: order.channel,
        orderId: id,
        orderTotal: totals.total,
        comp: dto.comp ?? false,
        createdById: userId,
      });

      await tx.order.update({ where: { id }, data: { status: 'paid', bookingId } });
      await this.enqueueBillPrint(tx, order.channel, created, pct);
      await this.maybeCloseSession(tx, order.tableSessionId);
      return created;
    });

    await this.emitAfterSettlement(id, { rooms: true });
    return this.toBillDTO(bill);
  }

  /**
   * Split an order into N fully-paid bills (spec §2.6). Parts must partition
   * every active line exactly once; order-level discounts are allocated across
   * parts in proportion to each part's subtotal.
   */
  async split(
    id: string,
    dto: SplitBillDto,
    userId: string,
    approverId: string | undefined,
  ): Promise<BillDTO[]> {
    const bills = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: ORDER_INCLUDE,
      });
      if (!order) throw new NotFoundException('Order not found');
      if (order.status === 'paid') {
        throw new ConflictException('Order is already paid');
      }
      if (!PAYABLE_STATUSES.includes(order.status)) {
        throw new ConflictException(`Cannot split a ${order.status} order`);
      }

      const activeItems = order.items.filter((it) => it.status !== 'cancelled');
      this.assertPartition(activeItems, dto.parts.map((p) => p.orderItemIds));

      const itemById = new Map(activeItems.map((it) => [it.id, it]));
      const pct = await this.serviceCharge.percentageFor(order.channel);

      // Order-level discount pool, allocated across parts by subtotal weight.
      const orderDiscountTotal = round2(
        order.discounts
          .filter((d) => d.scope === 'order')
          .reduce((sum, d) => sum + decToNum(d.amount), 0),
      );
      const partSubtotals = dto.parts.map((part) =>
        round2(
          part.orderItemIds.reduce((sum, itemId) => {
            const it = itemById.get(itemId)!;
            return sum + lineTotalOf({ qty: it.qty, unitPrice: decToNum(it.unitPrice) });
          }, 0),
        ),
      );
      const orderDiscountShares = allocateProportional(
        orderDiscountTotal,
        partSubtotals,
      );

      const created: BillWithRelations[] = [];
      for (let p = 0; p < dto.parts.length; p++) {
        const part = dto.parts[p];
        const subtotal = partSubtotals[p];
        const lineDiscount = round2(
          part.orderItemIds.reduce((sum, itemId) => {
            const lineDiscounts = order.discounts.filter(
              (d) => d.scope === 'line' && d.orderItemId === itemId,
            );
            return sum + lineDiscounts.reduce((s, d) => s + decToNum(d.amount), 0);
          }, 0),
        );
        const discountTotal = Math.min(
          round2(lineDiscount + orderDiscountShares[p]),
          subtotal,
        );
        const net = round2(subtotal - discountTotal);
        const serviceCharge = round2((net * pct) / 100);
        const total = round2(net + serviceCharge);
        this.assertTendersMatch(part.payments, total);

        const bill = await tx.bill.create({
          data: {
            orderId: id,
            label: part.label ?? `Split ${p + 1}`,
            subtotal: new Prisma.Decimal(subtotal),
            discountTotal: new Prisma.Decimal(discountTotal),
            serviceCharge: new Prisma.Decimal(serviceCharge),
            total: new Prisma.Decimal(total),
            items: {
              create: part.orderItemIds.map((itemId) => {
                const it = itemById.get(itemId)!;
                return {
                  orderItemId: it.id,
                  description: it.menuItem.name,
                  qty: new Prisma.Decimal(it.qty),
                  unitPrice: new Prisma.Decimal(it.unitPrice),
                  lineTotal: new Prisma.Decimal(
                    lineTotalOf({ qty: it.qty, unitPrice: decToNum(it.unitPrice) }),
                  ),
                };
              }),
            },
            payments: {
              create: part.payments.map((pay) => ({
                orderId: id,
                method: pay.method as PaymentMethod,
                amount: new Prisma.Decimal(pay.amount),
                reference: pay.reference ?? null,
                takenById: userId,
              })),
            },
          },
          include: BILL_INCLUDE,
        });
        await this.enqueueBillPrint(tx, order.channel, bill, pct);
        created.push(bill);
      }

      await tx.order.update({ where: { id }, data: { status: 'paid' } });
      await this.audit.record(
        {
          action: 'split_bill',
          entityType: 'order',
          entityId: id,
          actorId: userId,
          approverId: approverId ?? null,
          metadata: { parts: dto.parts.length },
        },
        tx,
      );
      await this.maybeCloseSession(tx, order.tableSessionId);
      return created;
    });

    await this.emitAfterSettlement(id);
    return bills.map((b) => this.toBillDTO(b));
  }

  // --- Private helpers ---------------------------------------------------

  private async buildOrderItems(
    channel: Channel,
    inputs: OrderItemInput[],
  ): Promise<Prisma.OrderItemCreateManyOrderInput[]> {
    const ids = [...new Set(inputs.map((i) => i.menuItemId))];
    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: ids }, isActive: true },
      include: { prices: true },
    });
    const byId = new Map(menuItems.map((m) => [m.id, m]));

    return inputs.map((input) => {
      const menuItem = byId.get(input.menuItemId);
      if (!menuItem) {
        throw new BadRequestException(
          `Menu item ${input.menuItemId} not found or inactive`,
        );
      }
      // Bar orders inherit the restaurant price for food that has no explicit
      // bar price (resolveChannelPrice falls dine_in_bar back to dine_in_restaurant).
      const price = resolveChannelPrice(menuItem.prices, channel);
      if (!price) {
        throw new BadRequestException(
          `"${menuItem.name}" has no price for channel ${channel}`,
        );
      }
      return {
        menuItemId: menuItem.id,
        qty: input.qty,
        unitPrice: new Prisma.Decimal(price.price),
        station: menuItem.station,
        status: 'draft',
        notes: input.notes ?? null,
      };
    });
  }

  private async loadRecipes(
    tx: Prisma.TransactionClient,
    menuItemIds: string[],
  ): Promise<Map<string, { ingredientId: string; quantity: Prisma.Decimal }[]>> {
    const recipes = await tx.recipe.findMany({
      where: { menuItemId: { in: [...new Set(menuItemIds)] } },
    });
    const map = new Map<string, { ingredientId: string; quantity: Prisma.Decimal }[]>();
    for (const r of recipes) {
      const list = map.get(r.menuItemId) ?? [];
      list.push({ ingredientId: r.ingredientId, quantity: r.quantity });
      map.set(r.menuItemId, list);
    }
    return map;
  }

  /** Reverse a sent item's exact stock deduction by negating its sale movements. */
  private async reverseStockForItem(
    tx: Prisma.TransactionClient,
    itemId: string,
    userId: string,
  ): Promise<void> {
    const alreadyReversed = await tx.stockMovement.count({
      where: { refId: itemId, refType: 'order_item', reason: 'return' },
    });
    if (alreadyReversed > 0) return;

    const sales = await tx.stockMovement.findMany({
      where: { refId: itemId, refType: 'order_item', reason: 'sale' },
    });
    for (const sale of sales) {
      await this.ledger.applyMovement(tx, {
        ingredientId: sale.ingredientId,
        changeQty: new Prisma.Decimal(sale.changeQty).negated(),
        reason: 'return',
        refType: 'order_item',
        refId: itemId,
        unitCostAtTime: sale.unitCostAtTime,
        note: 'void reversal',
        createdById: userId,
      });
    }
  }

  private async maybeCloseSession(
    tx: Prisma.TransactionClient,
    tableSessionId: string | null,
  ): Promise<void> {
    if (!tableSessionId) return;
    const session = await tx.tableSession.findUnique({
      where: { id: tableSessionId },
      include: { orders: { select: { status: true } } },
    });
    if (!session || session.closedAt) return;
    const allDone = session.orders.every(
      (o) => o.status === 'paid' || o.status === 'cancelled',
    );
    if (!allDone) return;
    await tx.tableSession.update({
      where: { id: tableSessionId },
      data: { closedAt: new Date() },
    });
    await tx.diningTable.update({
      where: { id: session.tableId },
      data: { status: 'needs_cleaning' },
    });
  }

  /**
   * Undo an accidental seating: if voiding/cancelling leaves the table's session
   * with no live (non-cancelled) items across any of its orders and nothing has
   * been paid, the table was never really used — so cancel the now-empty orders,
   * close the session, and return the table to `free` (available), NOT
   * `needs_cleaning`. Distinct from {@link maybeCloseSession}, which sends a
   * genuinely-used table to cleaning. Returns whether it freed a table so the
   * caller can broadcast `tables:updated`.
   */
  private async freeSessionIfEmptied(
    tx: Prisma.TransactionClient,
    tableSessionId: string | null,
  ): Promise<boolean> {
    if (!tableSessionId) return false;
    const session = await tx.tableSession.findUnique({
      where: { id: tableSessionId },
      include: {
        orders: { select: { status: true, items: { select: { status: true } } } },
      },
    });
    if (!session || session.closedAt) return false;
    // Anything paid means the table was really used — leave it to the normal
    // settlement → needs_cleaning path.
    if (session.orders.some((o) => o.status === 'paid')) return false;
    const hasLiveItem = session.orders.some((o) =>
      o.items.some((it) => it.status !== 'cancelled'),
    );
    if (hasLiveItem) return false;

    await tx.order.updateMany({
      where: { tableSessionId, status: { notIn: ['cancelled', 'paid'] } },
      data: { status: 'cancelled' },
    });
    await tx.tableSession.update({
      where: { id: tableSessionId },
      data: { closedAt: new Date() },
    });
    await tx.diningTable.update({
      where: { id: session.tableId },
      data: { status: 'free' },
    });
    return true;
  }

  private async enqueueBillPrint(
    tx: Prisma.TransactionClient,
    channel: Channel,
    bill: BillWithRelations,
    serviceChargePct: number,
  ): Promise<void> {
    // Read the singleton outlet inside the same tx so header customisation and
    // toggles are captured at print time (spec: owner-editable receipt).
    const outlet = await tx.outlet.findFirst({ orderBy: { createdAt: 'asc' } });
    await tx.printJob.create({
      data: {
        type: 'bill',
        station: null,
        orderId: bill.orderId,
        billId: bill.id,
        payload: this.buildBillPayload(channel, bill, outlet, serviceChargePct),
      },
    });
  }

  private async resolveTableName(
    tx: Prisma.TransactionClient,
    tableSessionId: string | null,
  ): Promise<string | null> {
    if (!tableSessionId) return null;
    const session = await tx.tableSession.findUnique({
      where: { id: tableSessionId },
      include: { table: { select: { name: true } } },
    });
    return session?.table.name ?? null;
  }

  private buildKotPayload(
    orderId: string,
    channel: Channel,
    station: string,
    tableName: string | null,
    notes: string | null,
    items: { menuItem: { name: string }; qty: number; notes: string | null }[],
  ): Prisma.InputJsonObject {
    // KOT never shows prices (spec §3.1).
    return {
      kind: 'kot',
      orderId,
      channel,
      station,
      tableName,
      notes,
      createdAt: new Date().toISOString(),
      items: items.map((it) => ({
        name: it.menuItem.name,
        qty: it.qty,
        notes: it.notes,
      })),
    };
  }

  /**
   * Assemble the render model the print-agent turns into a receipt. Header/footer
   * lines are populated only when their outlet `show*` toggle is on and the value
   * is non-empty, so the renderer just prints each line "if present". The currency
   * label prefixes the total/payment lines (custom `Rs.`-style label when enabled,
   * else the ₨ symbol). Cash tenders carry the derived change.
   */
  private buildBillPayload(
    channel: Channel,
    bill: BillWithRelations,
    outlet: Outlet | null,
    serviceChargePct: number,
  ): Prisma.InputJsonObject {
    const headerText = (show: boolean, value: string | null): string | undefined => {
      if (!show || value == null) return undefined;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    };

    const businessName = headerText(outlet?.showName ?? false, outlet?.name ?? null);
    const tagline = headerText(outlet?.showTagline ?? false, outlet?.tagline ?? null);
    const address = headerText(outlet?.showAddress ?? false, outlet?.address ?? null);
    const phone = headerText(outlet?.showPhone ?? false, outlet?.phone ?? null);
    const taxNumber = headerText(outlet?.showTaxNumber ?? false, outlet?.taxNumber ?? null);
    const footer = headerText(outlet?.showFooter ?? false, outlet?.receiptFooter ?? null);
    const currencyLabel =
      headerText(outlet?.showCurrencyLabel ?? false, outlet?.receiptCurrencyLabel ?? null) ??
      DEFAULT_CURRENCY_SYMBOL;

    return {
      kind: 'bill',
      billId: bill.id,
      orderId: bill.orderId,
      channel,
      label: bill.label,
      currencySymbol: DEFAULT_CURRENCY_SYMBOL,
      currencyLabel,
      serviceChargePct,
      logo: outlet?.showLogo ?? false,
      ...(businessName ? { businessName } : {}),
      ...(tagline ? { tagline } : {}),
      ...(address ? { address } : {}),
      ...(phone ? { phone } : {}),
      ...(taxNumber ? { taxNumber } : {}),
      ...(footer ? { footer } : {}),
      items: bill.items.map((it) => ({
        description: it.description,
        qty: decToNum(it.qty),
        unitPrice: decToNum(it.unitPrice),
        lineTotal: decToNum(it.lineTotal),
      })),
      subtotal: decToNum(bill.subtotal),
      discountTotal: decToNum(bill.discountTotal),
      serviceCharge: decToNum(bill.serviceCharge),
      total: decToNum(bill.total),
      payments: bill.payments.map((p) => {
        const amount = decToNum(p.amount);
        const tendered = p.tendered != null ? decToNum(p.tendered) : null;
        const change = tendered != null ? round2(tendered - amount) : null;
        return {
          method: p.method,
          amount,
          reference: p.reference,
          ...(tendered != null ? { tendered } : {}),
          ...(change != null && change > 0 ? { change } : {}),
        };
      }),
      createdAt: bill.createdAt.toISOString(),
    };
  }

  /** Base amount a new discount applies to, net of discounts already recorded. */
  private discountBase(
    order: OrderWithRelations,
    scope: 'order' | 'line',
    orderItemId: string | null,
  ): number {
    const active = order.items.filter((it) => it.status !== 'cancelled');
    const activeIds = new Set(active.map((it) => it.id));

    if (scope === 'line' && orderItemId) {
      const item = active.find((it) => it.id === orderItemId)!;
      const lineTotal = lineTotalOf({
        qty: item.qty,
        unitPrice: decToNum(item.unitPrice),
      });
      const existing = order.discounts
        .filter((d) => d.scope === 'line' && d.orderItemId === orderItemId)
        .reduce((sum, d) => sum + decToNum(d.amount), 0);
      return round2(lineTotal - existing);
    }

    const subtotal = round2(
      active.reduce(
        (sum, it) =>
          sum + lineTotalOf({ qty: it.qty, unitPrice: decToNum(it.unitPrice) }),
        0,
      ),
    );
    const existing = order.discounts
      .filter(
        (d) =>
          d.scope === 'order' ||
          (d.orderItemId != null && activeIds.has(d.orderItemId)),
      )
      .reduce((sum, d) => sum + decToNum(d.amount), 0);
    return round2(subtotal - existing);
  }

  private computeTotals(order: OrderWithRelations, pct: number) {
    const lines: TotalsLine[] = order.items.map((it) => ({
      id: it.id,
      qty: it.qty,
      unitPrice: decToNum(it.unitPrice),
      cancelled: it.status === 'cancelled',
    }));
    const discounts: TotalsDiscount[] = order.discounts.map((d) => ({
      scope: d.scope,
      amount: decToNum(d.amount),
      orderItemId: d.orderItemId,
    }));
    return computeOrderTotals(lines, discounts, pct);
  }

  private assertTendersMatch(
    payments: { amount: number }[],
    total: number,
  ): void {
    const paid = sumMoney(payments.map((p) => p.amount));
    if (Math.abs(paid - total) > 0.001) {
      throw new BadRequestException(
        `Payments (${paid.toFixed(2)}) must equal the total (${total.toFixed(2)})`,
      );
    }
  }

  private assertPartition(
    activeItems: OrderItemWithMenu[],
    groups: string[][],
  ): void {
    const activeIds = new Set(activeItems.map((it) => it.id));
    const seen = new Set<string>();
    for (const group of groups) {
      for (const itemId of group) {
        if (!activeIds.has(itemId)) {
          throw new BadRequestException(
            `Item ${itemId} is not a billable line on this order`,
          );
        }
        if (seen.has(itemId)) {
          throw new BadRequestException(
            `Item ${itemId} appears in more than one split part`,
          );
        }
        seen.add(itemId);
      }
    }
    if (seen.size !== activeIds.size) {
      throw new BadRequestException(
        'Every billable line must appear in exactly one split part',
      );
    }
  }

  private async assertSessionOpen(id: string): Promise<void> {
    const session = await this.prisma.tableSession.findUnique({ where: { id } });
    if (!session) throw new BadRequestException('Table session not found');
    if (session.closedAt) {
      throw new ConflictException('Table session is closed');
    }
  }

  private async assertBookingActive(id: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new BadRequestException('Booking not found');
    if (booking.status === 'checked_out' || booking.status === 'cancelled') {
      throw new ConflictException('Booking is not active');
    }
  }

  private assertNotFinal(order: OrderWithRelations): void {
    if (FINAL_STATUSES.includes(order.status)) {
      throw new ConflictException(`Order is ${order.status}`);
    }
  }

  private findItem(order: OrderWithRelations, itemId: string): OrderItemWithMenu {
    const item = order.items.find((it) => it.id === itemId);
    if (!item) throw new NotFoundException('Order item not found');
    return item;
  }

  private async loadOrderOrThrow(id: string): Promise<OrderWithRelations> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private async orderDTO(order: OrderWithRelations): Promise<OrderDTO> {
    const pct = await this.serviceCharge.percentageFor(order.channel);
    return this.toOrderDTO(order, pct);
  }

  /**
   * Compute the DTO for a just-mutated order, broadcast `order:updated`, and
   * return it. Used by every mutating path so connected POS/KDS screens react
   * live; reads (`get`/`list`) use {@link orderDTO} and stay silent.
   */
  private async emitOrderDTO(order: OrderWithRelations): Promise<OrderDTO> {
    const dto = await this.orderDTO(order);
    this.realtime.emitOrderUpdated(dto);
    return dto;
  }

  /**
   * Post-settlement broadcast shared by pay / charge-to-room / split: the order
   * is now paid (`order:updated`), and its table session may have closed
   * (`tables:updated`). Charge-to-room also writes a folio (`rooms:updated`).
   */
  private async emitAfterSettlement(
    id: string,
    opts: { rooms?: boolean } = {},
  ): Promise<void> {
    const order = await this.loadOrderOrThrow(id);
    this.realtime.emitOrderUpdated(await this.orderDTO(order));
    if (order.tableSessionId) this.realtime.emitTablesUpdated();
    if (opts.rooms) this.realtime.emitRoomsUpdated();
  }

  private async serviceChargePctByChannel(
    channels: Channel[],
  ): Promise<Partial<Record<Channel, number>>> {
    const unique = [...new Set(channels)];
    const entries = await Promise.all(
      unique.map(async (c) => [c, await this.serviceCharge.percentageFor(c)] as const),
    );
    return Object.fromEntries(entries) as Partial<Record<Channel, number>>;
  }

  private toOrderDTO(order: OrderWithRelations, pct: number): OrderDTO {
    const items = order.items.map((it) => ({
      id: it.id,
      menuItemId: it.menuItemId,
      name: it.menuItem.name,
      qty: it.qty,
      unitPrice: decToNum(it.unitPrice),
      lineTotal: lineTotalOf({ qty: it.qty, unitPrice: decToNum(it.unitPrice) }),
      station: it.station,
      status: it.status,
      notes: it.notes,
    }));
    const discounts = order.discounts.map((d) => ({
      id: d.id,
      scope: d.scope,
      type: d.type,
      value: decToNum(d.value),
      amount: decToNum(d.amount),
      reason: d.reason,
      orderItemId: d.orderItemId,
    }));
    const totals = this.computeTotals(order, pct);
    return {
      id: order.id,
      channel: order.channel,
      status: order.status,
      tableSessionId: order.tableSessionId,
      bookingId: order.bookingId,
      notes: order.notes,
      items,
      discounts,
      ...totals,
      createdAt: order.createdAt.toISOString(),
    };
  }

  private toBillDTO(bill: BillWithRelations): BillDTO {
    return {
      id: bill.id,
      orderId: bill.orderId,
      label: bill.label,
      items: bill.items.map((it) => ({
        id: it.id,
        orderItemId: it.orderItemId,
        description: it.description,
        qty: decToNum(it.qty),
        unitPrice: decToNum(it.unitPrice),
        lineTotal: decToNum(it.lineTotal),
      })),
      subtotal: decToNum(bill.subtotal),
      discountTotal: decToNum(bill.discountTotal),
      serviceCharge: decToNum(bill.serviceCharge),
      total: decToNum(bill.total),
      payments: bill.payments.map((p) => {
        const amount = decToNum(p.amount);
        const tendered = p.tendered != null ? decToNum(p.tendered) : null;
        const change = tendered != null ? round2(tendered - amount) : null;
        return {
          id: p.id,
          method: p.method,
          amount,
          tendered,
          change,
          reference: p.reference,
          createdAt: p.createdAt.toISOString(),
        };
      }),
      createdAt: bill.createdAt.toISOString(),
    };
  }
}
