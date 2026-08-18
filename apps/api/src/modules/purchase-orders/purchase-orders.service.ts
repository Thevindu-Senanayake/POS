import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@pos/db';
import type { PurchaseOrderDTO, PurchaseOrderStatus } from '@pos/shared';
import { round2 } from '@pos/shared';
import { decToNum } from '../../common/decimal';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StockLedgerService } from '../stock/stock-ledger.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';

const PO_INCLUDE = {
  supplier: { select: { name: true } },
  items: {
    orderBy: { id: 'asc' },
    include: { ingredient: { select: { name: true } } },
  },
} satisfies Prisma.PurchaseOrderInclude;

type PurchaseOrderWithRelations = Prisma.PurchaseOrderGetPayload<{
  include: typeof PO_INCLUDE;
}>;

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: StockLedgerService,
    private readonly audit: AuditService,
  ) {}

  async list(status?: PurchaseOrderStatus): Promise<PurchaseOrderDTO[]> {
    const orders = await this.prisma.purchaseOrder.findMany({
      where: status ? { status } : undefined,
      include: PO_INCLUDE,
      orderBy: { orderedAt: 'desc' },
    });
    return orders.map((po) => this.toDTO(po));
  }

  async get(id: string): Promise<PurchaseOrderDTO> {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: PO_INCLUDE,
    });
    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }
    return this.toDTO(po);
  }

  async create(
    dto: CreatePurchaseOrderDto,
    userId: string,
  ): Promise<PurchaseOrderDTO> {
    await this.assertSupplierExists(dto.supplierId);
    await this.assertIngredientsExist(dto.items.map((i) => i.ingredientId));

    const po = await this.prisma.purchaseOrder.create({
      data: {
        supplierId: dto.supplierId,
        reference: dto.reference ?? null,
        createdById: userId,
        items: {
          create: dto.items.map((i) => ({
            ingredientId: i.ingredientId,
            qty: new Prisma.Decimal(i.qty),
            unitCost: new Prisma.Decimal(i.unitCost),
            batchRef: i.batchRef ?? null,
          })),
        },
      },
      include: PO_INCLUDE,
    });
    return this.toDTO(po);
  }

  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrderDTO> {
    const existing = await this.prisma.purchaseOrder.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Purchase order not found');
    }
    if (existing.status === 'received') {
      throw new ConflictException('Cannot edit a received purchase order');
    }
    if (dto.supplierId !== undefined) {
      await this.assertSupplierExists(dto.supplierId);
    }
    if (dto.items !== undefined) {
      await this.assertIngredientsExist(dto.items.map((i) => i.ingredientId));
    }

    const po = await this.prisma.$transaction(async (tx) => {
      if (dto.items !== undefined) {
        await tx.purchaseOrderItem.deleteMany({
          where: { purchaseOrderId: id },
        });
        await tx.purchaseOrderItem.createMany({
          data: dto.items.map((i) => ({
            purchaseOrderId: id,
            ingredientId: i.ingredientId,
            qty: new Prisma.Decimal(i.qty),
            unitCost: new Prisma.Decimal(i.unitCost),
            batchRef: i.batchRef ?? null,
          })),
        });
      }
      const data: Prisma.PurchaseOrderUncheckedUpdateInput = {};
      if (dto.supplierId !== undefined) {
        data.supplierId = dto.supplierId;
      }
      if (dto.reference !== undefined) {
        data.reference = dto.reference;
      }
      if (Object.keys(data).length > 0) {
        await tx.purchaseOrder.update({ where: { id }, data });
      }
      return tx.purchaseOrder.findUniqueOrThrow({
        where: { id },
        include: PO_INCLUDE,
      });
    });
    return this.toDTO(po);
  }

  /**
   * Receive a draft PO (spec §2.2). For each line: append a `purchase` stock
   * movement (which increments currentStock inside the same tx), then update the
   * ingredient's weighted-average cost using stock/cost as they were *before*
   * this receipt. Sets status → received and writes a `goods_received` audit row.
   */
  async receive(id: string, userId: string): Promise<PurchaseOrderDTO> {
    const po = await this.prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!order) {
        throw new NotFoundException('Purchase order not found');
      }
      if (order.status === 'received') {
        throw new ConflictException('Purchase order already received');
      }
      if (order.items.length === 0) {
        throw new BadRequestException('Cannot receive an empty purchase order');
      }

      for (const item of order.items) {
        const ingredient = await tx.ingredient.findUniqueOrThrow({
          where: { id: item.ingredientId },
        });

        const currentStock = new Prisma.Decimal(ingredient.currentStock);
        const oldStock = currentStock.lessThan(0)
          ? new Prisma.Decimal(0)
          : currentStock;
        const oldCost = new Prisma.Decimal(ingredient.costPerUnit);
        const qty = new Prisma.Decimal(item.qty);
        const unitCost = new Prisma.Decimal(item.unitCost);

        const denominator = oldStock.plus(qty);
        const newCost = denominator.isZero()
          ? unitCost
          : oldStock
              .times(oldCost)
              .plus(qty.times(unitCost))
              .dividedBy(denominator);

        await this.ledger.applyMovement(tx, {
          ingredientId: item.ingredientId,
          changeQty: qty,
          reason: 'purchase',
          refType: 'purchase_order',
          refId: order.id,
          unitCostAtTime: unitCost,
          note: order.reference ? `PO ${order.reference}` : null,
          createdById: userId,
        });

        await tx.ingredient.update({
          where: { id: item.ingredientId },
          data: { costPerUnit: newCost.toDecimalPlaces(4) },
        });
      }

      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: { status: 'received', receivedAt: new Date() },
        include: PO_INCLUDE,
      });

      await this.audit.record(
        {
          action: 'goods_received',
          entityType: 'purchase_order',
          entityId: order.id,
          reason: order.reference ?? null,
          actorId: userId,
          metadata: { itemCount: order.items.length },
        },
        tx,
      );

      return updated;
    });
    return this.toDTO(po);
  }

  async remove(id: string): Promise<void> {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }
    if (po.status === 'received') {
      throw new ConflictException('Cannot delete a received purchase order');
    }
    await this.prisma.purchaseOrder.delete({ where: { id } });
  }

  private async assertSupplierExists(supplierId: string): Promise<void> {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
    });
    if (!supplier) {
      throw new BadRequestException('Supplier does not exist');
    }
  }

  private async assertIngredientsExist(ids: string[]): Promise<void> {
    const unique = [...new Set(ids)];
    const count = await this.prisma.ingredient.count({
      where: { id: { in: unique } },
    });
    if (count !== unique.length) {
      throw new BadRequestException('One or more ingredients do not exist');
    }
  }

  private toDTO(po: PurchaseOrderWithRelations): PurchaseOrderDTO {
    const items = po.items.map((it) => ({
      id: it.id,
      ingredientId: it.ingredientId,
      ingredientName: it.ingredient?.name,
      qty: decToNum(it.qty),
      unitCost: decToNum(it.unitCost),
      batchRef: it.batchRef,
    }));
    const total = round2(
      items.reduce((sum, it) => sum + it.qty * it.unitCost, 0),
    );
    return {
      id: po.id,
      supplierId: po.supplierId,
      supplierName: po.supplier?.name,
      status: po.status,
      reference: po.reference,
      orderedAt: po.orderedAt.toISOString(),
      receivedAt: po.receivedAt ? po.receivedAt.toISOString() : null,
      items,
      total,
    };
  }
}
