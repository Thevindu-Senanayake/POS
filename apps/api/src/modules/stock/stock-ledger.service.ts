import { Injectable } from '@nestjs/common';
import { Prisma } from '@pos/db';
import type { StockReason, StockRefType } from '@pos/shared';
import { PrismaService } from '../../prisma/prisma.service';

export interface StockMovementInput {
  ingredientId: string;
  /** Signed quantity in the ingredient's base unit (negative = deduction). */
  changeQty: Prisma.Decimal | number | string;
  reason: StockReason;
  refType: StockRefType;
  refId?: string | null;
  unitCostAtTime?: Prisma.Decimal | number | string | null;
  note?: string | null;
  createdById?: string | null;
}

/**
 * The single writer of stock. The append-only stock_movements table is the
 * source of truth (spec §2.1); Ingredient.currentStock is a cache kept in sync
 * ONLY here, inside the same transaction that appends the movement.
 */
@Injectable()
export class StockLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /** Append a movement and sync currentStock. MUST run inside a transaction. */
  async applyMovement(tx: Prisma.TransactionClient, input: StockMovementInput): Promise<void> {
    await tx.stockMovement.create({
      data: {
        ingredientId: input.ingredientId,
        changeQty: input.changeQty,
        reason: input.reason,
        refType: input.refType,
        refId: input.refId ?? null,
        unitCostAtTime: input.unitCostAtTime ?? null,
        note: input.note ?? null,
        createdById: input.createdById ?? null,
      },
    });
    await tx.ingredient.update({
      where: { id: input.ingredientId },
      data: { currentStock: { increment: input.changeQty } },
    });
  }

  async applyMany(tx: Prisma.TransactionClient, inputs: StockMovementInput[]): Promise<void> {
    for (const input of inputs) {
      await this.applyMovement(tx, input);
    }
  }

  /** Record a single movement in its own transaction (standalone adjustments). */
  async record(input: StockMovementInput): Promise<void> {
    await this.prisma.$transaction((tx) => this.applyMovement(tx, input));
  }
}
