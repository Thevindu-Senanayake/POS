import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@pos/db';
import type {
  Channel,
  MenuCategory,
  MenuItemDTO,
  ScanResultDTO,
  SpiritGroupDTO,
  SpiritPourDTO,
} from '@pos/shared';
import { CATEGORY_DEFAULT_STATION } from '@pos/shared';
import { decToNum } from '../../common/decimal';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateMenuItemDto,
  MenuItemPriceInput,
} from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';

const MENU_INCLUDE = {
  prices: { orderBy: { channel: 'asc' } },
} satisfies Prisma.MenuItemInclude;

type MenuItemWithPrices = Prisma.MenuItemGetPayload<{
  include: typeof MENU_INCLUDE;
}>;

/**
 * A MenuItem is a spirit pour iff it has exactly one recipe line drawing from an
 * `ml`-based ingredient. This is what separates pours from the rest of the bar:
 * food dishes have multiple recipe lines (and g/pcs ingredients), and beer/cans
 * have no recipe at all. Pure + exported so the boundary is unit-tested without a DB.
 */
export function isSpiritPour(item: {
  recipes: { ingredient: { baseUnit: string } }[];
}): boolean {
  return item.recipes.length === 1 && item.recipes[0].ingredient.baseUnit === 'ml';
}

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  async list(opts: {
    category?: MenuCategory;
    includeInactive?: boolean;
  }): Promise<MenuItemDTO[]> {
    const items = await this.prisma.menuItem.findMany({
      where: {
        ...(opts.category ? { category: opts.category } : {}),
        ...(opts.includeInactive ? {} : { isActive: true }),
      },
      include: MENU_INCLUDE,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return items.map((i) => this.toDTO(i));
  }

  async get(id: string): Promise<MenuItemDTO> {
    return this.toDTO(await this.getEntity(id));
  }

  /**
   * Resolve a scanned barcode (bar USB scanner, spec feature (c)). A barcode may
   * sit on a whole-unit MenuItem (bottled beer/cans → add directly) or on a spirit
   * bottle Ingredient (→ offer the pour MenuItems built from it, smallest first so
   * the picker reads 25 → 750 ml). Only active items/ingredients resolve.
   */
  async scan(code: string): Promise<ScanResultDTO> {
    const barcode = code.trim();
    if (!barcode) return { kind: 'none' };

    const item = await this.prisma.menuItem.findFirst({
      where: { barcode, isActive: true },
      include: MENU_INCLUDE,
    });
    if (item) return { kind: 'item', item: this.toDTO(item) };

    const ingredient = await this.prisma.ingredient.findFirst({
      where: { barcode, isActive: true },
    });
    if (ingredient) {
      return {
        kind: 'spirit',
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        pours: await this.poursForIngredient(ingredient.id),
      };
    }

    return { kind: 'none' };
  }

  /**
   * The pour sizes sellable for a spirit bottle: every active MenuItem whose
   * recipe draws from this ingredient, smallest first (so a picker reads 25 → 750
   * ml). Shared by `scan()` (bottle barcode) and `listSpirits()` (grid tiles).
   */
  private async poursForIngredient(
    ingredientId: string,
  ): Promise<SpiritPourDTO[]> {
    const recipes = await this.prisma.recipe.findMany({
      where: { ingredientId, menuItem: { isActive: true } },
      orderBy: { quantity: 'asc' },
      include: { menuItem: { include: MENU_INCLUDE } },
    });
    return recipes.map((r) => ({
      item: this.toDTO(r.menuItem),
      volumeMl: decToNum(r.quantity),
    }));
  }

  /**
   * Every spirit as one group per bottle, for the bar grid: instead of showing
   * each pour size as its own tile, the grid shows one tile per bottle that opens
   * the pour picker. A "spirit pour" is a MenuItem with exactly one recipe line
   * drawing from an `ml`-based ingredient — which excludes food (multi-line, g/pcs)
   * and beer/cans (no recipe). Channel filtering is left to the client (mirrors the
   * grid's per-channel price filtering), so one response serves every channel.
   */
  async listSpirits(): Promise<SpiritGroupDTO[]> {
    const items = await this.prisma.menuItem.findMany({
      where: { category: 'bar', isActive: true },
      include: { ...MENU_INCLUDE, recipes: { include: { ingredient: true } } },
      orderBy: { name: 'asc' },
    });

    const groups = new Map<string, SpiritGroupDTO>();
    for (const item of items) {
      if (!isSpiritPour(item)) continue;
      const recipe = item.recipes[0];

      let group = groups.get(recipe.ingredientId);
      if (!group) {
        group = {
          ingredientId: recipe.ingredientId,
          ingredientName: recipe.ingredient.name,
          menuGroup: item.menuGroup,
          pours: [],
        };
        groups.set(recipe.ingredientId, group);
      }
      group.pours.push({
        item: this.toDTO(item),
        volumeMl: decToNum(recipe.quantity),
      });
    }

    const result = [...groups.values()];
    for (const g of result) g.pours.sort((a, b) => a.volumeMl - b.volumeMl);
    return result.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
  }

  async create(dto: CreateMenuItemDto): Promise<MenuItemDTO> {
    this.assertNoDuplicateChannels(dto.prices);
    const station = dto.station ?? CATEGORY_DEFAULT_STATION[dto.category];
    const item = await this.prisma.menuItem.create({
      data: {
        name: dto.name,
        category: dto.category,
        station,
        menuGroup: dto.menuGroup ?? null,
        barcode: dto.barcode ?? null,
        ...(dto.prices && dto.prices.length > 0
          ? {
              prices: {
                create: dto.prices.map((p) => ({
                  channel: p.channel,
                  price: new Prisma.Decimal(p.price),
                })),
              },
            }
          : {}),
      },
      include: MENU_INCLUDE,
    });
    return this.toDTO(item);
  }

  async update(id: string, dto: UpdateMenuItemDto): Promise<MenuItemDTO> {
    await this.getEntity(id);
    const data: Prisma.MenuItemUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.station !== undefined) data.station = dto.station;
    if (dto.menuGroup !== undefined) data.menuGroup = dto.menuGroup;
    if (dto.barcode !== undefined) data.barcode = dto.barcode;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    const item = await this.prisma.menuItem.update({
      where: { id },
      data,
      include: MENU_INCLUDE,
    });
    return this.toDTO(item);
  }

  async setPrices(
    id: string,
    prices: MenuItemPriceInput[],
  ): Promise<MenuItemDTO> {
    await this.getEntity(id);
    this.assertNoDuplicateChannels(prices);
    await this.prisma.$transaction(
      prices.map((p) =>
        this.prisma.menuItemPrice.upsert({
          where: { menuItemId_channel: { menuItemId: id, channel: p.channel } },
          create: {
            menuItemId: id,
            channel: p.channel,
            price: new Prisma.Decimal(p.price),
          },
          update: { price: new Prisma.Decimal(p.price) },
        }),
      ),
    );
    return this.get(id);
  }

  async removePrice(id: string, channel: Channel): Promise<void> {
    await this.getEntity(id);
    const res = await this.prisma.menuItemPrice.deleteMany({
      where: { menuItemId: id, channel },
    });
    if (res.count === 0) {
      throw new NotFoundException('No price set for that channel');
    }
  }

  /** Hard-delete only if never ordered; otherwise the caller should deactivate. */
  async remove(id: string): Promise<void> {
    await this.getEntity(id);
    const orderCount = await this.prisma.orderItem.count({
      where: { menuItemId: id },
    });
    if (orderCount > 0) {
      throw new ConflictException(
        'Menu item is referenced by orders; deactivate it instead',
      );
    }
    await this.prisma.menuItem.delete({ where: { id } });
  }

  private async getEntity(id: string): Promise<MenuItemWithPrices> {
    const item = await this.prisma.menuItem.findUnique({
      where: { id },
      include: MENU_INCLUDE,
    });
    if (!item) {
      throw new NotFoundException('Menu item not found');
    }
    return item;
  }

  private assertNoDuplicateChannels(prices?: MenuItemPriceInput[]): void {
    if (!prices) return;
    const channels = prices.map((p) => p.channel);
    if (new Set(channels).size !== channels.length) {
      throw new BadRequestException('Duplicate channel in prices');
    }
  }

  private toDTO(item: MenuItemWithPrices): MenuItemDTO {
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      station: item.station,
      menuGroup: item.menuGroup,
      barcode: item.barcode,
      isActive: item.isActive,
      prices: item.prices.map((p) => ({
        channel: p.channel,
        price: decToNum(p.price),
      })),
    };
  }
}
