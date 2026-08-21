import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Ingredient, Prisma } from '@pos/db';
import type { IngredientDepartment, IngredientDTO, StockMovementDTO } from '@pos/shared';
import { decToNum, decToNumOrNull } from '../../common/decimal';
import { PrismaService } from '../../prisma/prisma.service';
import { StockLedgerService } from '../stock/stock-ledger.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';

@Injectable()
export class IngredientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: StockLedgerService,
  ) {}

  async list(includeInactive = false, department?: IngredientDepartment): Promise<IngredientDTO[]> {
    const rows = await this.prisma.ingredient.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(department ? { department } : {}),
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.toDTO(r));
  }

  async get(id: string): Promise<IngredientDTO> {
    const row = await this.prisma.ingredient.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Ingredient not found');
    return this.toDTO(row);
  }

  async create(dto: CreateIngredientDto, userId: string): Promise<IngredientDTO> {
    const opening = dto.openingStock ?? 0;
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ingredient.create({
        data: {
          name: dto.name,
          baseUnit: dto.baseUnit,
          department: dto.department ?? 'restaurant',
          barcode: dto.barcode ?? null,
          reorderLevel: dto.reorderLevel ?? 0,
          costPerUnit: dto.costPerUnit ?? 0,
          supplierId: dto.supplierId ?? null,
        },
      });
      if (opening > 0) {
        await this.ledger.applyMovement(tx, {
          ingredientId: created.id,
          changeQty: opening,
          reason: 'adjustment',
          refType: 'manual',
          unitCostAtTime: dto.costPerUnit ?? 0,
          note: 'Opening balance',
          createdById: userId,
        });
      }
      return tx.ingredient.findUniqueOrThrow({ where: { id: created.id } });
    });
    return this.toDTO(row);
  }

  async update(id: string, dto: UpdateIngredientDto): Promise<IngredientDTO> {
    await this.ensureExists(id);
    // currentStock is deliberately not updatable here — it only moves via the ledger.
    const data: Prisma.IngredientUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.baseUnit !== undefined) data.baseUnit = dto.baseUnit;
    if (dto.department !== undefined) data.department = dto.department;
    if (dto.barcode !== undefined) data.barcode = dto.barcode;
    if (dto.reorderLevel !== undefined) data.reorderLevel = dto.reorderLevel;
    if (dto.costPerUnit !== undefined) data.costPerUnit = dto.costPerUnit;
    if (dto.supplierId !== undefined) data.supplierId = dto.supplierId ?? null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    const row = await this.prisma.ingredient.update({ where: { id }, data });
    return this.toDTO(row);
  }

  async adjust(id: string, dto: AdjustStockDto, userId: string): Promise<IngredientDTO> {
    if (dto.changeQty === 0) throw new BadRequestException('changeQty must be non-zero');
    const ingredient = await this.prisma.ingredient.findUnique({ where: { id } });
    if (!ingredient) throw new NotFoundException('Ingredient not found');
    await this.ledger.record({
      ingredientId: id,
      changeQty: dto.changeQty,
      reason: dto.reason,
      refType: 'manual',
      unitCostAtTime: decToNum(ingredient.costPerUnit),
      note: dto.note ?? null,
      createdById: userId,
    });
    return this.get(id);
  }

  async movements(id: string, limit = 100): Promise<StockMovementDTO[]> {
    await this.ensureExists(id);
    const rows = await this.prisma.stockMovement.findMany({
      where: { ingredientId: id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
    return rows.map((m) => ({
      id: m.id,
      ingredientId: m.ingredientId,
      changeQty: decToNum(m.changeQty),
      reason: m.reason,
      refType: m.refType,
      refId: m.refId,
      unitCostAtTime: decToNumOrNull(m.unitCostAtTime),
      note: m.note,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  private async ensureExists(id: string): Promise<void> {
    const found = await this.prisma.ingredient.count({ where: { id } });
    if (!found) throw new NotFoundException('Ingredient not found');
  }

  private toDTO(r: Ingredient): IngredientDTO {
    const currentStock = decToNum(r.currentStock);
    const reorderLevel = decToNum(r.reorderLevel);
    return {
      id: r.id,
      name: r.name,
      baseUnit: r.baseUnit,
      department: r.department,
      currentStock,
      reorderLevel,
      costPerUnit: decToNum(r.costPerUnit),
      supplierId: r.supplierId,
      barcode: r.barcode,
      isActive: r.isActive,
      lowStock: reorderLevel > 0 && currentStock <= reorderLevel,
    };
  }
}
